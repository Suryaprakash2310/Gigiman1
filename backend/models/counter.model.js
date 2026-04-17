const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  seq: {
    type: Number,
    default: 0,
  },
  freeIds: {
    type: [Number],
    default: [],
  }
});

module.exports = mongoose.model('Counter', counterSchema);
