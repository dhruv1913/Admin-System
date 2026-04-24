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
    const uid = req.body.uid || 'temp'; 
    
    // ✅ FIX: Ignore the original extension and force it to be .jpg 
    // This ensures it perfectly matches the frontend Avatar component and LDAP database!
    cb(null, `${uid}.jpg`);
  }
});

// Tip: 25KB is very small for an image. You might want to temporarily increase this to 500KB (500 * 1024) 
// to make sure your test images aren't silently failing the size check!
const photoUpload = multer({ storage: storage, limits: { fileSize: 500 * 1024 } }); 
const uploadMemory = multer({ storage: multer.memoryStorage() });

module.exports = { photoUpload, uploadMemory };