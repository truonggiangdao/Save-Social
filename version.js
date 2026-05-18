/** Tăng SAVE_SOCIAL_BUILD mỗi lần deploy (cùng giá trị trong index.html & manifest). */
var SAVE_SOCIAL_BUILD = "202605183";
if (typeof window !== "undefined") window.SAVE_SOCIAL_BUILD = SAVE_SOCIAL_BUILD;
if (typeof self !== "undefined" && typeof window === "undefined") self.SAVE_SOCIAL_BUILD = SAVE_SOCIAL_BUILD;
