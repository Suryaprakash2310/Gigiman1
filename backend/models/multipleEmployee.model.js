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
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "SingleEmployee",
  //   validate: {
  //   validator: function(v) {
  //     return v.length <= 10; // example limit
  //   },
  //   message: "Team cannot exceed 10 members"
  // }
  }],
  pendingRequests: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "SingleEmployee"
  }],
  leader: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SingleEmployee"
  },
  helpers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "SingleEmployee"
  }],
  ownerName: {
    type: String,
    required: true,
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
  role: {
    type: String,
    enum: Object.values(ROLES),
    required: true,
    default: ROLES.MULTIPLE_EMPLOYEE,
  },
  location: {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point"
    },
    coordinates: {
      type: [Number],
      required: true
    }
  },
  socketId: {
    type: String,
    default: null
  },
  isActive: {
    type: Boolean,
    default: false,
  },
  cancelCount: {
    type: Number,
    default: 0,
  },

  blockedUntil: {
    type: Date,
    default: null,
  },
  teamStatus: {
    type: String,
    enum: ["AVAILABLE", "OFFERED", "BUSY"],
    default: "AVAILABLE",
  },

  offerBookingId: {
    type: mongoose.Types.ObjectId,
    ref: "Booking",
    default: null,
  },
}, { timestamps: true });

MultipleEmployeeSchema.index({ location: "2dsphere" });


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

//Remove the dulpicated member before save
MultipleEmployeeSchema.pre("save", function (next) {
  // ✅ SAFELY normalize members
  if (Array.isArray(this.members)) {
    this.members = [...new Set(this.members.map(id => id.toString()))]
      .map(id => new mongoose.Types.ObjectId(id));
  } else {
    this.members = [];
  }

  // ✅ SAFELY normalize pendingRequests
  if (Array.isArray(this.pendingRequests)) {
    this.pendingRequests = [...new Set(this.pendingRequests.map(id => id.toString()))]
      .map(id => new mongoose.Types.ObjectId(id));
  } else {
    this.pendingRequests = [];
  }

  next();
});


module.exports = mongoose.model('MultipleEmployee', MultipleEmployeeSchema);
