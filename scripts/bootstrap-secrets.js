(function (w) {
  w.PAPER_SECRETS = Object.assign(
    { openai: "", helius: "", solanaTracker: "" },
    w.PAPER_SECRETS || {}
  );
})(typeof globalThis !== "undefined" ? globalThis : window);
