/* Donation cloud connections are disabled; local visual previews remain available. */
(function(){
  'use strict';
  window.GBTI_DONATION_CLOUD_ENABLED=false;
  window.GBTI_DONATION_API='';
  window.GBTI_RECEIPT_ENDPOINT='';
  window.GBTI_DONATIONS?.disconnect();
})();
