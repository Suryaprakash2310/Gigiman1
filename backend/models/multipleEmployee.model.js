const mongoose = require('mongoose');
const Counter = require('./counter.model');
const ROLES = require("../enum/role.enum");

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
      type:String,
      ref: "SingleEmployee",
    }
  ],
  pendingRequests: [
    {
      type: String,
      ref: "SingleEmployee",
    }
  ],
  ownerName: {
    type: String,
    required: true,
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
    type: String,
    required: true,
    unique: true,
  },
  phoneMasked: {
    type: String,
    required: true,
  },
  phoneHash: {
    type: String,
    required: true,
    index: true,
    unique: true,
  },
  role: {
    type: String,
    enum: Object.values(ROLES),
    required: true,
    default: ROLES.MULTIPLE_EMPLOYEE,
  },
  leader:{
    type:String,
    ref:"SingleEmployee",
  },
  helpers:[{
    type:String,
    ref:"SingleEmployee",
  }],
  location: {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point"
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    }
  },
  socketId: { 
        type: String,
        default: null 
    },
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
      idNumber = counter.freeIds.shift();   // Reuse freed ID
    } else {
      counter.seq += 1;                     // Increment sequence
      idNumber = counter.seq;
    }
    const paddedNumber = idNumber.toString().padStart(4, '0');
    this.TeamId = `M${paddedNumber}`;
    await counter.save();
  }
  next();
});

// Free ID on delete
MultipleEmployeeSchema.post('findOneAndDelete', async function (doc) {
  if (doc && doc.TeamId) {
    const counter = await Counter.findOne({ name: 'MultipleEmployee' });
    if (counter) {
      const freedNumber = parseInt(doc.TeamId.replace('M', ''));
      if (!isNaN(freedNumber)) {
        counter.freeIds.push(freedNumber);
        counter.freeIds.sort((a, b) => a - b);
        await counter.save();
      }
    }
  }
});

module.exports = mongoose.model('MultipleEmployee', MultipleEmployeeSchema);
