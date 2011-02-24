describe("RhoSync", function() {
//    var syncUrl = "http://rhodes-store-server.heroku.com/application";
    var syncUrl = "http://localhost:9292/application";


	beforeEach(function() {
		rhosync = RhoSync({syncserver:syncUrl});
        notified = false;
        notify = function(evt, obj){
            jasmine.log(evt.type + ': ' + $.toJSON(obj));
            notified = true;
        };
	});
  
	it("should be initialized", function() {
    	expect(rhosync.rhoconfig.syncserver).toEqual(syncUrl);
 	});

    it("should login ok with proper credentials", function() {
        //fakeAjax({urls: {'/login': {successData: 'login'}}});

        var hdlr = jasmine.createSpy('ajax handler spy');

        $(window).bind(rhosync.api.events.NOTIFY_GENERIC, null, notify);

        rhosync.api.login("lars", "larspass").done(function(data, response){
            hdlr("success", response);
        }).fail(function(data, response){
            hdlr("error", response);
        });

        waitsFor(function(){ return 0 < hdlr.callCount;}, 3000);
        runs(function(){
            expect(hdlr).toHaveBeenCalledWith("success", "");
            expect(notified).toBeTruthy();

            $(window).unbind(rhosync.api.events.NOTIFY_GENERIC, notify);
        });
    });

    it("should fail to login with wrong credentials", function() {
        //fakeAjax({urls: {'/login': {successData: 'error'}}});

        var hdlr = jasmine.createSpy('ajax handler spy');

        $(window).bind(rhosync.api.events.NOTIFY_GENERIC, null, notify);

        rhosync.api.login("not_lars", "not_larspass").done(function(data, response){
            hdlr("success", response);
        }).fail(function(data, response){
            hdlr("error", response);
        });

        waitsFor(function(){ return 0 < hdlr.callCount;}, 3000);
        runs(function(){
            expect(hdlr).toHaveBeenCalledWith("error", "");
            expect(notified).toBeTruthy();

            $(window).unbind(rhosync.api.events.NOTIFY_GENERIC, notify);
        });
    });
});