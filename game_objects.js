export class Note {
    constructor(laneIndex, speed) {
        this.laneIndex = laneIndex;
        this.y = -50; // Start above screen
        this.speed = speed;
        this.hit = false;
        this.missed = false;
        // Vib-Ribbon shapes: 0=Loop, 1=Square, 2=Triangle, 3=X (mapped to lanes)
        this.type = laneIndex;
    }

    update(deltaTime) {
        // Normalize speed to 60fps (approx 16.67ms per frame)
        const frameScale = deltaTime / 16.67;
        this.y += this.speed * frameScale;
    }

    draw(ctx, laneX, laneWidth) {
        if (this.hit) return;

        ctx.strokeStyle = "white";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        const centerX = laneX + laneWidth / 2;
        const size = 30;

        ctx.beginPath();

        // Scribble effect (random jitter)
        const jitter = () => (Math.random() - 0.5) * 2;

        // Vib-Ribbon style wireframe arrows
        const half = size / 2;

        switch (this.type) {
            case 0: // Left Arrow
                ctx.moveTo(centerX + half + jitter(), this.y - half + jitter());
                ctx.lineTo(centerX - half + jitter(), this.y + jitter()); // Tip
                ctx.lineTo(centerX + half + jitter(), this.y + half + jitter());
                // Inner scribble
                ctx.moveTo(centerX + half - 5 + jitter(), this.y - half + 5 + jitter());
                ctx.lineTo(centerX - half + 5 + jitter(), this.y + jitter());
                ctx.lineTo(centerX + half - 5 + jitter(), this.y + half - 5 + jitter());
                break;
            case 1: // Down Arrow
                ctx.moveTo(centerX - half + jitter(), this.y - half + jitter());
                ctx.lineTo(centerX + jitter(), this.y + half + jitter()); // Tip
                ctx.lineTo(centerX + half + jitter(), this.y - half + jitter());
                // Inner scribble
                ctx.moveTo(centerX - half + 5 + jitter(), this.y - half + 5 + jitter());
                ctx.lineTo(centerX + jitter(), this.y + half - 5 + jitter());
                ctx.lineTo(centerX + half - 5 + jitter(), this.y - half + 5 + jitter());
                break;
            case 2: // Up Arrow
                ctx.moveTo(centerX - half + jitter(), this.y + half + jitter());
                ctx.lineTo(centerX + jitter(), this.y - half + jitter()); // Tip
                ctx.lineTo(centerX + half + jitter(), this.y + half + jitter());
                // Inner scribble
                ctx.moveTo(centerX - half + 5 + jitter(), this.y + half - 5 + jitter());
                ctx.lineTo(centerX + jitter(), this.y - half + 5 + jitter());
                ctx.lineTo(centerX + half - 5 + jitter(), this.y + half - 5 + jitter());
                break;
            case 3: // Right Arrow
                ctx.moveTo(centerX - half + jitter(), this.y - half + jitter());
                ctx.lineTo(centerX + half + jitter(), this.y + jitter()); // Tip
                ctx.lineTo(centerX - half + jitter(), this.y + half + jitter());
                // Inner scribble
                ctx.moveTo(centerX - half + 5 + jitter(), this.y - half + 5 + jitter());
                ctx.lineTo(centerX + half - 5 + jitter(), this.y + jitter());
                ctx.lineTo(centerX - half + 5 + jitter(), this.y + half - 5 + jitter());
                break;
        }

        ctx.stroke();
    }
}

export class Lane {
    constructor(index, x, width) {
        this.index = index;
        this.x = x;
        this.width = width;
        this.notes = [];
        this.keyNames = ['←', '↓', '↑', '→'];
    }

    spawnNote(speed) {
        this.notes.push(new Note(this.index, speed));
    }

    update(deltaTime, targetY, hitWindow, onHit, onMiss) {
        for (let i = this.notes.length - 1; i >= 0; i--) {
            const note = this.notes[i];
            note.update(deltaTime);

            // Check miss
            if (note.y > targetY + hitWindow && !note.hit && !note.missed) {
                note.missed = true;
                onMiss();
            }

            // Cleanup
            if (note.y > targetY + 200) {
                this.notes.splice(i, 1);
            }
        }
    }

    draw(ctx, targetY) {
        // Draw Lane Line (wireframe style)
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(this.x, 0);
        ctx.lineTo(this.x, 800); // rough height
        ctx.moveTo(this.x + this.width, 0);
        ctx.lineTo(this.x + this.width, 800);
        ctx.stroke();

        // Draw Target Marker (Receptor)
        const centerX = this.x + this.width / 2;
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.beginPath();

        const size = 35;
        const half = size / 2;

        if (this.index === 0) { // Left
            ctx.moveTo(centerX + half, targetY - half);
            ctx.lineTo(centerX - half, targetY);
            ctx.lineTo(centerX + half, targetY + half);
        }
        else if (this.index === 1) { // Down
            ctx.moveTo(centerX - half, targetY - half);
            ctx.lineTo(centerX, targetY + half);
            ctx.lineTo(centerX + half, targetY - half);
        }
        else if (this.index === 2) { // Up
            ctx.moveTo(centerX - half, targetY + half);
            ctx.lineTo(centerX, targetY - half);
            ctx.lineTo(centerX + half, targetY + half);
        }
        else if (this.index === 3) { // Right
            ctx.moveTo(centerX - half, targetY - half);
            ctx.lineTo(centerX + half, targetY);
            ctx.lineTo(centerX - half, targetY + half);
        }
        ctx.stroke();

        // Draw Key Name
        ctx.fillStyle = "white";
        ctx.font = "bold 20px 'Courier Prime', monospace";
        ctx.textAlign = "center";
        ctx.fillText(this.keyNames[this.index], centerX, targetY + 60);

        // Draw Notes
        this.notes.forEach(note => note.draw(ctx, this.x, this.width));
    }

    checkInput(targetY, hitWindow) {
        // Find closest note
        let closestNote = null;
        let minDist = Infinity;

        this.notes.forEach(note => {
            if (!note.hit && !note.missed) {
                const dist = Math.abs(note.y - targetY);
                if (dist < minDist) {
                    minDist = dist;
                    closestNote = note;
                }
            }
        });

        if (closestNote && minDist <= hitWindow) {
            closestNote.hit = true;
            return true; // Hit
        }
        return false; // Miss/Ghost tap
    }
}
