const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    userId: { type: Number, required: true, unique: true },
    username: { type: String },
    firstName: { type: String },
    lastName: { type: String },
    joinedAt: { type: Date, default: Date.now },
    
    watchedAnime: [{
        mal_id: Number,
        title: String,
        genres: [String],
        watchedAt: { type: Date, default: Date.now }
    }],


    genreWeights: {
        type: Map,  // Stores genres as keys with percentage as values
        of: Number, // Example: { "Action": 35, "Romance": 20, "Horror": 15 }
        default: {}
    }
});

module.exports = mongoose.model("User", userSchema);
