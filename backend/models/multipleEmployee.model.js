const mongoose = require('mongoose');
const Counter = require('./counter.model');

const MultipleEmployeeSchema = new mongoose.Schema({
  TeamId: {
    type: String,
    unique: true,
  },
  storeName: {
    type: String,
    required: true,
  },
  members: [
    {
       type: String, 
      ref: "SingleEmployee",
    }
  ],
  pendingRequests: [
    {
      type: String, // waiting approval userId
      ref: "SingleEmployee",
    }
  ],
  ownerName: {
    type: String,
    required: true,
  },
  userName: {
    type: String,
    required: true,
    unique: true,
  },
  gstNo: {
    type: String,
    required: true,
    unique: true,
  },
  storeLocation: {
    type: String,
    required: true,
  },
  phoneNo: {
    type: Number,
    required: true,
    unique: true,
  }
}, { timestamps: true });

// Auto-generate TeamId (M1, M2, ...)
MultipleEmployeeSchema.pre('save', async function (next) {
  if (this.isNew) {
    let counter = await Counter.findOne({ name: 'MultipleEmployee' });
    if (!counter) {
      counter = await Counter.create({ name: 'MultipleEmployee' });
    }

    let idNumber;
    if (counter.freeIds.length > 0) {
      idNumber = counter.freeIds.shift();
    } else {
      idNumber = counter.nextNumber;
      counter.nextNumber += 1;
    }

    this.TeamId = `M${idNumber}`;
    await counter.save();
  }
  next();
});

// Free up ID when deleted
MultipleEmployeeSchema.post('findOneAndDelete', async function (doc) {
  if (doc) {
    const counter = await Counter.findOne({ name: 'MultipleEmployee' });
    if (counter) {
      const freedNumber = parseInt(doc.TeamId.replace('E', ''));
      counter.freeIds.push(freedNumber);
      counter.freeIds.sort((a, b) => a - b);
      await counter.save();
    }
  }
});

module.exports = mongoose.model('MultipleEmployee', MultipleEmployeeSchema);
