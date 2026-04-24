const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
      const destPath = path.join(__dirname, '../uploads');
      if (!fs.existsSync(destPath)) {
          fs.mkdirSync(destPath, { recursive: true });
      }
      cb(null, destPath);
  },
  filename: (req, file, cb) => {
    // We give it a random name initially to prevent overwriting
    const tempName = `temp_${Date.now()}_${Math.round(Math.random() * 1000)}.jpg`;
    cb(null, tempName);
  }
});

const photoUpload = multer({ storage: storage, limits: { fileSize: 500 * 1024 } }); 
const uploadMemory = multer({ storage: multer.memoryStorage() });

module.exports = { photoUpload, uploadMemory };