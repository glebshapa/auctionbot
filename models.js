import mongoose from 'mongoose';
import config from './config.js';
mongoose.connect(config.db.url, { useNewUrlParser: true, useUnifiedTopology: true });

const User = mongoose.model("users", new mongoose.Schema({
    id: Number,
    ban: Boolean,
    state: String,
    auctions: Array,
    cntWonAuctions: Number,
    cntBets: Number,
    
}));

const Lot = mongoose.model("lots", new mongoose.Schema({
    id: Number,
    status: String,
    text: String,
    seller: String,
    top: Array,
    start: Number,
    startDate: Number,
    endDate: Number,
    photoId: String,
    msgId: Number
}));


export { User, Lot };
