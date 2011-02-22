describe("RhoSync", function() {
	beforeEach(function() {
		rhosync = $.RhoSync({syncserver:"http://localhost:9292/application"})
	});
  
	it("should be initialized", function() {
    	expect(rhosync.rhoconfig.syncserver).toEqual("http://localhost:9292/application");
 	});

	it("should login", function() {
	    fakeAjax({urls: {'/login': {successData: 'login'}}});
		var result = 'blah';
		rhosync.api.login("user","password",function(status,data) {
			result = data;
		});
	    expect(result).toEqual('login');
	});

	it("should fail to login", function() {
	    fakeAjax({urls: {'/login': {errorMessage: 'Unknown user'}}});
		var result = 'blah';
		rhosync.api.login("user","password",function(status,data) {
			result = data;
		});
	    expect(result).toEqual('Unknown user');
	});
});