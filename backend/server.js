require('dotenv').config();
const app = require('./app');
const path = require('path');
const PORT = process.env.PORT || 3001;




// Just start the server normally!
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});