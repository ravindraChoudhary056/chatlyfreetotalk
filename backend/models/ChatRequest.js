const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ChatRequestSchema = new Schema({
  senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  receiverId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  firstMessage: { type: String, required: true },
  status: { type: String, enum: ['pending','accepted','rejected'], default: 'pending' },
}, { timestamps: true });

module.exports = mongoose.model('ChatRequest', ChatRequestSchema);
