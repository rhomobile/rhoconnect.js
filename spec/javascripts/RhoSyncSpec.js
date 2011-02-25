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
            expect(hdlr).toHaveBeenCalledWith("success", null);
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
            expect(hdlr).toHaveBeenCalledWith("error", "Unauthorized");
            expect(notified).toBeTruthy();
            $(window).unbind(rhosync.api.events.NOTIFY_GENERIC, notify);
        });
    });

    it("should be able to start sync engine", function() {
        $(window).bind(rhosync.api.events.NOTIFY_CLIENT_CREATED, null, notify);

        rhosync.api.login("lars", "larspass").done(function(){
            rhosync.api.engine.clientCreate();
        });

        waitsFor(function(){ return notified;}, 3000);
        runs(function(){
            expect(notified).toBeTruthy();
            $(window).unbind(rhosync.api.events.NOTIFY_CLIENT_CREATED, notify);
        });
    });


    describe("Rhomobile.db.DbStorage", function() {

        beforeEach(function() {
            rhosync = RhoSync({syncserver:syncUrl});
        });

        it("is able to open database", function() {
            var okHdlr = jasmine.createSpy('for ok');
            var errHdlr = jasmine.createSpy('for errors');

            expect(rhosync.api.storage.open).toBeDefined();
            rhosync.api.storage.open().done(okHdlr).fail(errHdlr);

            waitsFor(function(){ return 0 < okHdlr.callCount;}, 3000);
            runs(function(){
                expect(errHdlr).not.toHaveBeenCalled();
            });
        });

        it("is able to perform a query", function() {
            var okHdlr = jasmine.createSpy('for ok');
            var errHdlr = jasmine.createSpy('for errors');

            expect(rhosync.api.storage.executeSQL).toBeDefined();
            rhosync.api.storage.executeSQL("SELECT name FROM sqlite_master WHERE type='table'", null).done(function(){
                okHdlr(arguments);
            }).fail(function(){
                errHdlr(arguments);
            });

            waitsFor(function(){ return 0 < okHdlr.callCount;}, 3000);
            runs(function(){
                expect(errHdlr).not.toHaveBeenCalled();
            });
        });

        it("is able to initialized", function() {
            var okHdlr = jasmine.createSpy('for ok');
            var errHdlr = jasmine.createSpy('for errors');
            expect(rhosync.api.storage.initSchema).toBeDefined();
            expect(rhosync.api.storage.executeSQL).toBeDefined();
            rhosync.api.storage.initSchema().done(okHdlr).fail(errHdlr);

            waitsFor(function(){ return 0 < okHdlr.callCount;}, 3000);
            runs(function(){
                expect(errHdlr).not.toHaveBeenCalled();
            });

            var names;
            rhosync.api.storage.getAllTableNames().done(function(tx, tbNames){
                okHdlr(arguments);
                names = tbNames;
            }).fail(function(){
                errHdlr(arguments);
            });

            waitsFor(function(){ return 1 < okHdlr.callCount;}, 3000);
            runs(function(){
                expect(errHdlr).not.toHaveBeenCalled();
                expect(names).toBeDefined();
                expect(names.length).toEqual(4+1);
                expect(names).toContain('sources');
            });

        });

    });



});