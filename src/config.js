const mongoose = require("mongoose");

async function connectDB() {
    const mongoURI = "mongodb+srv://noasaga-project:7xwlXO28YNkfBHuW@noasaga-bots.tvb0y1h.mongodb.net/noasaga-bots?retryWrites=true&w=majority";

    try {
        await mongoose.connect(mongoURI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log("✅ MongoDB Connected!");
    } catch (error) {
        console.error("❌ MongoDB Connection Error:", error);
    }
}

module.exports = connectDB;
