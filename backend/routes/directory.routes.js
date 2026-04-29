 const express = require('express');
const router = express.Router();
const dirController = require('../controllers/directoryController');
const authMiddleware = require('../middleware/authMiddleware');
const { photoUpload, uploadMemory } = require('../middleware/uploadMiddleware');
    
// 🚨 Only import our new bulletproof middleware
const { decryptPayload } = require('../middleware/encryptionMiddleware');

router.use(authMiddleware);

router.get('/users/:ou', dirController.getUsers);


router.post('/add', photoUpload.single('photo'), decryptPayload, dirController.addUser);
router.put('/edit', photoUpload.single('photo'), decryptPayload, dirController.editUser);

router.delete('/delete/:uid', dirController.deleteUser);
router.post('/bulk', uploadMemory.single('file'), dirController.bulkImport);

router.post('/bulk-delete', decryptPayload, dirController.bulkDelete);
router.post('/bulk-suspend', decryptPayload, dirController.bulkSuspend);

router.get('/export', dirController.exportUsers);

router.get('/ous', dirController.getOUs);
router.get('/ous-stats', dirController.getDepartmentsStats);

// 🚨 Swapped secureMiddleware to decryptPayload for departments too
router.post('/add-ou', decryptPayload, dirController.createDepartment);
router.delete('/delete-ou', decryptPayload, dirController.deleteDepartment);

router.get('/logs/sessions', dirController.getSessionLogs);
router.get('/logs/audits', dirController.getAuditLogs);

module.exports = router;