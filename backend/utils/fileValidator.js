const fs = require('fs');
const path = require('path');

// This checks the hidden binary signature of the file
const isRealImage = (buffer) => {
    if (!buffer || buffer.length < 4) return false;

    const hex = buffer.toString('hex', 0, 4).toUpperCase();
    
    // JPEG magic numbers start with FFD8FF
    if (hex.startsWith('FFD8FF')) return true;
    
    // PNG magic numbers start with 89504E47
    if (hex === '89504E47') return true;

    return false; // It's a fake file!
};

const saveSecureImage = (buffer, uid) => {
    const destPath = path.join(__dirname, '../uploads');
    if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
    }
    
    // Force the .jpg extension safely now that we know it's real
    const finalPath = path.join(destPath, `${uid}.jpg`);
    fs.writeFileSync(finalPath, buffer);
};

module.exports = { isRealImage, saveSecureImage };