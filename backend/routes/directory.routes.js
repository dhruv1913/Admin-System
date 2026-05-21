const express = require('express');
const router = express.Router();
const dirController = require('../controllers/directoryController');
const authMiddleware = require('../middleware/authMiddleware');
const { photoUpload, uploadMemory } = require('../middleware/uploadMiddleware');

// 🚨 Only import our new bulletproof middleware
const { decryptPayload } = require('../middleware/encryptionMiddleware');

router.use(authMiddleware);

router.get('/users/:ou', dirController.getUsers);


// 🚨 THE FIX: Use uploadMemory so the Magic Number scanner can read the file!
router.post('/add', uploadMemory.single('photo'), decryptPayload, dirController.addUser);
router.put('/edit', uploadMemory.single('photo'), decryptPayload, dirController.editUser);

router.delete('/delete/:uid', dirController.deleteUser);
// Remove uploadMemory since we are sending JSON data now!
router.post('/bulk', decryptPayload, dirController.bulkImport);

// router.post('/bulk-delete', decryptPayload, dirController.bulkDelete);
router.post('/bulk-suspend', decryptPayload, dirController.bulkSuspend);
router.post('/bulk-activate', decryptPayload, dirController.bulkActivate);

router.get('/export', dirController.exportUsers);

router.get('/ous', dirController.getOUs);
router.get('/ous-stats', dirController.getDepartmentsStats);

router.post('/add-ou', decryptPayload, dirController.createDepartment);
router.delete('/delete-ou', decryptPayload, dirController.deleteDepartment);


router.get('/logs/sessions', dirController.getSessionLogs);
router.get('/logs/audits', dirController.getAuditLogs);

module.exports = router;