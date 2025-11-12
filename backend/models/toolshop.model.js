const mongoose = require("mongoose");
const ROLES = require("../enum/role.model");
const Counter = require("./counter.model");

const toolshopSchema = new mongoose.Schema(
  {
    toolShopId: {
      type: String,
      unique: true,
    },
    shopName: {
      type: String,
      required: true,
    },
    ownerName: {
      type: String,
      required: true,
    },
    gstNo: {
      type: String,
      unique: true,
      required: true,
    },
    storeLocation: {
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
      enum: Object.values(ROLES),  
      default: ROLES.TOOL_SHOP,
      required: true,
    },
    location:{
      type:{
        type:String,
        enum:["Point"],
        default:"Point"
      },
      coordinates:{
        type:[Number],//[longitude,latitude]
        required:true,
      }
    }
  },
  { timestamps: true }
);

// Auto-generate Tool Shop ID (T1, T2, T3 ...)
toolshopSchema.pre("save", async function (next) {
  if (this.toolShopId) return next();

  let counter = await Counter.findOne({ name: "toolshop" });

  if (!counter) {
    counter = await Counter.create({ name: "toolshop", seq: 0, freeIds: [] });
  }

  let newNumber;

  if (counter.freeIds.length > 0) {
    newNumber = counter.freeIds.shift(); // reuse old ID
  } else {
    counter.seq += 1;
    newNumber = counter.seq;
  }
  const paddedNumber=newNumber.toString().padStart(4,'0');
  this.toolShopId = `T${paddedNumber}`;
  await counter.save();
  next();
});

// Free ID when deleted
toolshopSchema.post("findOneAndDelete", async function (doc) {
  if (!doc || !doc.toolShopId) return;

  const freedNumber = parseInt(doc.toolShopId.replace("T", ""));
  const counter = await Counter.findOne({ name: "toolshop" });

  if (counter && !counter.freeIds.includes(freedNumber)) {
    counter.freeIds.push(freedNumber);
    counter.freeIds.sort((a, b) => a - b);
    await counter.save();
  }
});

module.exports = mongoose.model("ToolShop", toolshopSchema);
