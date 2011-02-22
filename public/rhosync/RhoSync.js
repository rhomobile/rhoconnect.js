(function($) {
    $.RhoSync = function(config) {
		var defaults = {
			syncserver: "",
			pollinterval: 20
		}
		var config = $.extend({}, defaults, config);

		function _net_call(url,data) {
		    var dfr = $.Deferred();
		    $.ajax({
		    	url: url,
		     	data: data,
		     	dataType: 'jsonp',
		     	success: dfr.resolve,
				error: function (xhr, status) {
					dfr.reject(xhr.responseText);
				}
		    });
		    return dfr.promise();
		}
			
		function login(login,password,callback) {
			_net_call('/login',{login:login,password:password}
			).done(function(data) {
				callback("sucess",data);
			}).fail(function(data) {
				callback("error",data);
			});
		}
				
		return {
			api: {
				login:login
			},
			rhoconfig: config
		}
	}
})(jQuery);
