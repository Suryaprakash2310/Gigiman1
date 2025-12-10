const PART_REQUEST_STATUS = {
    REQUESTED: "requested",    // employee created part request
    APPROVED: "approved",      // user approved the request
    READY_FOR_PICKUP: "ready_for_pickup", // shop accepted and otp generated
    COLLECTED: "collected",    // employee collected with OTP
};


module.exports=PART_REQUEST_STATUS;