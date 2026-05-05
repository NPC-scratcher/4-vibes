export class AudioAnalyzer {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256; // Trade-off between time and frequency resolution
        this.bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(this.bufferLength);
        this.source = null;
        this.audioElement = null;
        this.delayNode = this.audioContext.createDelay(5.0);
    }

    async loadAudio(file, existingElement = null) {
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        if (existingElement) {
            this.audioElement = existingElement;
        } else {
            const url = URL.createObjectURL(file);
            this.audioElement = new Audio(url);
        }

        if (!this.source) {
            this.source = this.audioContext.createMediaElementSource(this.audioElement);
            this.source.connect(this.analyser);
            this.analyser.connect(this.delayNode);
            this.delayNode.connect(this.audioContext.destination);
        }

        return new Promise((resolve, reject) => {
            const onCanPlay = () => {
                cleanup();
                resolve(this.audioElement);
            };

            const onError = (e) => {
                cleanup();
                reject(e);
            };

            const cleanup = () => {
                this.audioElement.removeEventListener('canplaythrough', onCanPlay);
                this.audioElement.removeEventListener('canplay', onCanPlay);
                this.audioElement.removeEventListener('error', onError);
            };

            this.audioElement.addEventListener('canplaythrough', onCanPlay);
            this.audioElement.addEventListener('canplay', onCanPlay);
            this.audioElement.addEventListener('error', onError);

            // If already ready, resolve immediately
            if (this.audioElement.readyState >= 3) {
                onCanPlay();
            }
        });
    }

    play() {
        if (this.audioElement) {
            this.audioElement.play();
        }
    }

    getFrequencyData() {
        this.analyser.getByteFrequencyData(this.dataArray);
        return this.dataArray;
    }

    playHitSound() {
        // Simple synth hit sound using Web Audio
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, this.audioContext.currentTime);
        osc.frequency.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
        
        gain.gain.setValueAtTime(0.1, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
        
        osc.connect(gain);
        gain.connect(this.audioContext.destination);
        
        osc.start();
        osc.stop(this.audioContext.currentTime + 0.1);
    }

    // Simple beat detection based on energy threshold
    detectBeat(sensitivity = 200) {
        this.analyser.getByteFrequencyData(this.dataArray);
        let sum = 0;
        // Focus on low frequencies for beats (kick drums)
        for (let i = 0; i < 10; i++) {
            sum += this.dataArray[i];
        }
        const average = sum / 10;
        return average > sensitivity;
    }
}
