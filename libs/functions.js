const anonymize = require('ip-anonymize');
const loggerFactory = require('./logger.js');
const logger = loggerFactory.getLogger('PoolWorker', 'system');

module.exports = {
	anonymizeIP: function (ipaddr) {
		var retval = ipaddr;
		var portalConfig = JSON.parse(process.env.portalConfig);
		if (portalConfig.logips && portalConfig.anonymizeips) {
			retval = anonymize(ipaddr, portalConfig.ipv4bits, portalConfig.ipv6bits);
			logger.silly("ANONIP>TRUE> before [%s] after [%s]", ipaddr, retval);
		}
		else if (!(portalConfig.logips)) {
			retval = "AnOnYmOuS!";
			logger.debug("ANONIP>FULL> ipaddr [%s]", retval);
		} else {
		logger.debug("ANONIP>FALSE> ipaddr [%s]", retval);            
	}
	return retval;    
},

secToDHMSStr: function (seconds) {
	retval = "";
	var intDays = Math.floor(seconds / 86400) || 0;
	var intHrs = Math.floor((seconds % 86400) / 3600) || 0;
	var intMin = Math.floor(((seconds % 86400) % 3600) / 60) || 0;
	var intSec = Math.floor(((seconds % 86400) % 3600) % 60) || 0;
	if (intDays > 0) { retval = retval + intDays.toString() + "d "; }
	if (intDays > 0 || intHrs > 0) { retval = retval + intHrs.toString() + "h "; }
	retval = retval + intMin.toString() + "m ";
	retval = retval + intSec.toString() + "s";
	return retval
}
};
