// Matrix Rain Effect
// Inspired by The Matrix (1999)

class MatrixRain {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();

        // Matrix characters - katakana, latin, numbers
        this.chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()';
        this.charArray = this.chars.split('');

        this.fontSize = 14;
        this.columns = this.canvas.width / this.fontSize;
        this.drops = [];

        // Initialize drops
        for (let i = 0; i < this.columns; i++) {
            this.drops[i] = Math.random() * -100;
        }

        // Bind resize event
        window.addEventListener('resize', () => this.resizeCanvas());

        // Start animation
        this.animate();
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.columns = this.canvas.width / this.fontSize;
    }

    draw() {
        // Semi-transparent black to create fade effect
        this.ctx.fillStyle = 'rgba(10, 14, 39, 0.05)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Matrix color (controlled by CSS variable)
        const color = getComputedStyle(document.body).getPropertyValue('--matrix-color');
        this.ctx.fillStyle = (color && color.trim()) ? color.trim() : '#00f5ff';
        this.ctx.font = `${this.fontSize}px monospace`;

        // Draw characters
        for (let i = 0; i < this.drops.length; i++) {
            const char = this.charArray[Math.floor(Math.random() * this.charArray.length)];
            const x = i * this.fontSize;
            const y = this.drops[i] * this.fontSize;

            this.ctx.fillText(char, x, y);

            // Reset drop to top randomly
            if (y > this.canvas.height && Math.random() > 0.975) {
                this.drops[i] = 0;
            }

            this.drops[i]++;
        }
    }

    animate() {
        this.draw();
        requestAnimationFrame(() => this.animate());
    }
}

// Initialize Matrix effect when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new MatrixRain('matrix-canvas');
});
