const mongoose = require('mongoose');
const Counter = require('./counter.model');
const ROLES=require("../enum/role.model");

const singleEmployeeSchema = new mongoose.Schema({
  userId: {
    type: String,
    unique: true,
  },
  fullname: {
    type: String,
    required: true,
  },
  phoneNo: {
    type: Number,
    required: true,
    unique: true,
  },
  role: {
    type: String,
    enum:Object.values(ROLES),
    required: true,
    default:ROLES.SINGLE_EMPLOYEE
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
    type: Number,
    unique: true,
    required: true,
  },
  teamAccepted: {
  type: Boolean,
  default: false,
},

}, { timestamps: true });


//  Auto-generate sequential userId (E1, E2, ...)
singleEmployeeSchema.pre('save', async function (next) {
  if (this.userId) return next();

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
    return next(new Error("Invalid userId generation — newNumber is NaN"));
  }

  this.userId = `E${newNumber}`;
  await counter.save();
  next();
});


//  Free up the ID when an employee is deleted
singleEmployeeSchema.post('findOneAndDelete', async function (doc) {
  if(!doc || !doc.userId)return;
  if (doc && doc.userId) {
    const counter = await Counter.findOne({ name: 'employee' });
    if (counter) {
      const freedNumber = parseInt(doc.userId.replace('E', ''));
      if (!isNaN(freedNumber) && !counter.freeIds.includes(freedNumber)) {
        counter.freeIds.push(freedNumber);
        counter.freeIds.sort((a, b) => a - b);
        await counter.save();
      }
    }
  }
});

module.exports = mongoose.model("SingleEmployee", singleEmployeeSchema);
