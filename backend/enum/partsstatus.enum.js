// const PART_REQUEST_STATUS = {
//     REQUESTED: "requested",    // employee created part request
//     APPROVED: "approved",      // user approved the request
//     READY_FOR_PICKUP: "ready_for_pickup", // shop accepted and otp generated
//     COLLECTED: "collected",    // employee collected with OTP
// };
const PART_REQUEST_STATUS = {
  REQUESTED: "REQUESTED",
  APPROVED_BY_USER: "APPROVED_BY_USER",
  WAITING_TOOLSHOP: "WAITING_TOOLSHOP",
  READY_FOR_PICKUP: "READY_FOR_PICKUP",
  COLLECTED: "COLLECTED",
};



module.exports=PART_REQUEST_STATUS;