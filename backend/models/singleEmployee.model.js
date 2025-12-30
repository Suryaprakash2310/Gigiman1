const mongoose = require('mongoose');
const Counter = require('./counter.model');
const ROLES = require("../enum/role.enum");

const singleEmployeeSchema = new mongoose.Schema({
  empId: {
    type: String,
    unique: true,
  },
  fullname: {
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
  role: {
    type: String,
    enum: Object.values(ROLES),
    required: true,
    default: ROLES.SINGLE_EMPLOYEE
  },
  verified: {
    type: String,
    default: "No",
  },
  address: {
    city: {
      type: String,
      required: true,
    },
    state: {
      type: String,
      required: true,
    },
    pincode: {
      type: Number,
      required: true,
    },
  },
  aadhaarNo: {
    type: String,
    required: true,
  },
  aadhaarMasked: {
    type: String,
    required: true,
  },
  aadhaarHash: {
    type: String,
    required: true,
  },
  teamAccepted: {
    type: Boolean,
    default: false,
  },
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
  isActive: {
    type: Boolean,
  },
  cancelCount: {
    type: Number,
    default: 0,
  },

  blockedUntil: {
    type: Date,
    default: null,
  }


}, { timestamps: true });


//  Auto-generate sequential empId (E1, E2, ...)
singleEmployeeSchema.pre('save', async function (next) {
  if (this.empId) return next();

  let counter = await Counter.findOne({ name: 'employee' });

  if (!counter) {
    counter = await Counter.create({ name: 'employee', seq: 0, freeIds: [] });
  }

  let newNumber;

  // Reuse a freed ID if available
  if (counter.freeIds.length > 0) {
    newNumber = counter.freeIds.shift();//Reuse Old ID
  } else {
    counter.seq += 1;
    newNumber = counter.seq;
  }

  if (isNaN(newNumber)) {
    return next(new Error("Invalid empId generation — newNumber is NaN"));
  }
  const paddedNumber = newNumber.toString().padStart(4, '0');
  this.empId = `E${paddedNumber}`;
  await counter.save();
  next();
});


//  Free up the ID when an employee is deleted
singleEmployeeSchema.post('findOneAndDelete', async function (doc) {
  if (!doc || !doc.empId) return;
  if (doc && doc.empId) {
    const counter = await Counter.findOne({ name: 'employee' });
    if (counter) {
      const freedNumber = parseInt(doc.empId.replace('E', ''));
      if (!isNaN(freedNumber) && !counter.freeIds.includes(freedNumber)) {
        counter.freeIds.push(freedNumber);
        counter.freeIds.sort((a, b) => a - b);
        await counter.save();
      }
    }
  }
});

module.exports = mongoose.model("SingleEmployee", singleEmployeeSchema);
