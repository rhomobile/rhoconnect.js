describe("RhoConnect use cases", function(){

    describe("API", function(){
        it("should have methods defined", function() {
            expect(rhoconnect.rho.notify.SyncNotification).toBeDefined();
            expect(rhoconnect.isLoggedIn).toBeDefined();
            expect(rhoconnect.login).toBeDefined();
            expect(rhoconnect.logout).toBeDefined();
        });

    });

    describe("USE CASE: User initialize API with model definitions", function(){

        it("should be initialized with models", function() {
            var okHdlr = jasmine.createSpy('for ok');
            var errHdlr = jasmine.createSpy('for errors');

            expect(rhoconnect.init).toBeDefined();

            var models = [
                {name: 'Product', fields: [
                    {name: 'name',      type: 'string'},
                    {name: 'price',     type: 'int'},
                    {name: 'available', type: 'boolean', defaultValue: true}
                    ]},
                {name: 'Customer', fields: [
                    {name: 'name',      type: 'string'}
                    ]}   /*,
                {name: 'Order', fields: [
                    {name: 'unmber',       type: 'int'},
                    {name: 'productName',  type: 'string'},
                    {name: 'customerName', type: 'string'},
                    {name: 'address',      type: 'string'},
                    {name: 'phone',        type: 'string'}
                    ]}*/
            ];

            rhoconnect.init(models, 'native', null /*no progress update callback*/, false /*no data resey*/).done(okHdlr).fail(errHdlr);

            waitsForSpies([okHdlr, errHdlr], 'RhoConnect init timeout', 3000);
            runs(function(){
                expect(errHdlr).not.toHaveBeenCalled();
                if(0 < errHdlr.callCount) {
                    jasmine.log('errHdlr called with:');
                    jasmine.log(errHdlr.mostRecentCall.args);
                }

                expect(rhoconnect.rho.getModels()).toBeDefined('models map');
                expect(rhoconnect.rho.engine.getSources()).toBeDefined('sources map');

                expect(rhoconnect.rho.getModels().Product).toBeSet('Product model');
                expect(rhoconnect.rho.getModels().Product.name).toBeSet('Product model');
                expect(rhoconnect.rho.engine.getSources().Product).toBeSet('Product source');
                expect(rhoconnect.rho.engine.getSources().Product.name).toBeSet('Product source');
                expect(rhoconnect.rho.engine.getSources().Product.id).toBeGreaterThan(0);
                expect(rhoconnect.rho.getModels().Product.name).toEqual(rhoconnect.rho.engine.getSources().Product.name);
                jasmine.log(rhoconnect.rho.getModels().Product.name +' source id = ' +rhoconnect.rho.engine.getSources().Product.id);
            });
        });
    });

/*
    describe("USE CASE: User login with proper credentials", function(){
        beforeEach(function(){
            rhoconnect.logout();
        });

        it("should login ok with proper credentials", function() {
            var okHdlr = jasmine.createSpy('for ok');
            var errHdlr = jasmine.createSpy('for errors');

            expect(rhoconnect.isLoggedIn()).not.toBeTruthy();

            rhoconnect.login(userlogin, userpass, new rhoconnect.rho.notify.SyncNotification()).done(okHdlr).fail(errHdlr);

            waitsForSpies([okHdlr, errHdlr], 'login timeout');
            runs(function(){
                expect(errHdlr).not.toHaveBeenCalled();
                if(0 < errHdlr.callCount) {
                    jasmine.log('errHdlr called with:');
                    jasmine.log(errHdlr.mostRecentCall.args);
                }
                expect(okHdlr).toHaveBeenCalled();
                expect(rhoconnect.isLoggedIn()).toBeTruthy();
            });
        });
    });

    describe("USE CASE: User login with wrong credentials", function(){
        beforeEach(function(){
            rhoconnect.logout();
        });

        it("should fail", function() {
            var okHdlr = jasmine.createSpy('for ok');
            var errHdlr = jasmine.createSpy('for errors');

            expect(rhoconnect.isLoggedIn()).not.toBeTruthy();

            rhoconnect.login(userlogin, wrongpass, new rhoconnect.rho.notify.SyncNotification()).done(okHdlr).fail(errHdlr);

            waitsForSpies([okHdlr, errHdlr], 'login timeout');
            runs(function(){
                expect(okHdlr).not.toHaveBeenCalled();
                if(0 < okHdlr.callCount) {
                    jasmine.log('okHdlr called with:');
                    jasmine.log(okHdlr.mostRecentCall.args);
                }
                expect(errHdlr).toHaveBeenCalled();
                expect(rhoconnect.isLoggedIn()).not.toBeTruthy();
            });
        });
    });

    describe("USE CASE: User logout", function(){
        beforeEach(function(){
            //runs(function(){
                rhoconnect.login(userlogin, userpass, new rhoconnect.rho.notify.SyncNotification());
            //});
        });

        it("should logout ok", function() {
            var okHdlr = jasmine.createSpy('for ok');
            var errHdlr = jasmine.createSpy('for errors');

            runs(function(){
                expect(rhoconnect.isLoggedIn()).toBeTruthy();
                rhoconnect.logout().done(okHdlr).fail(errHdlr);
            });

            waitsForSpies([okHdlr, errHdlr], 'logout timeout');
            runs(function(){
                expect(errHdlr).not.toHaveBeenCalled();
                if(0 < errHdlr.callCount) {
                    jasmine.log('errHdlr called with:');
                    jasmine.log(errHdlr.mostRecentCall.args);
                }
                expect(okHdlr).toHaveBeenCalled();
                expect(rhoconnect.isLoggedIn()).not.toBeTruthy();
            });
        });
    });
*/

/*
    it("should login ok with proper credentials", function() {
        var okHdlr = jasmine.createSpy('for ok');
        var errHdlr = jasmine.createSpy('for errors');

        expect(rhoconnect.rho.notify.SyncNotification).toBeDefined();
        expect(rhoconnect.login).toBeDefined();
        expect(rhoconnect.isLoggedIn).toBeDefined();

        runs(function(){
            rhoconnect.login(userlogin, userpass, new rhoconnect.rho.notify.SyncNotification()).done(okHdlr).fail(errHdlr);
        });

        waitsForSpies([okHdlr, errHdlr], 'login timeout');
        runs(function(){
            expect(errHdlr).not.toHaveBeenCalled();
            if(0 < errHdlr.callCount) {
                jasmine.log('errHdlr called with:');
                jasmine.log(errHdlr.mostRecentCall.args);
            }
            expect(okHdlr).toHaveBeenCalled();
            expect(rhoconnect.isLoggedIn()).toBeTruthy();
        });
    });

    it("should logout ok", function() {
        var okHdlr = jasmine.createSpy('for ok');
        var errHdlr = jasmine.createSpy('for errors');

        expect(rhoconnect.logout).toBeDefined();
        expect(rhoconnect.isLoggedIn).toBeDefined();

        runs(function(){
            jasmine.log('login');
            rhoconnect.login(userlogin, userpass, new rhoconnect.rho.notify.SyncNotification()).done(okHdlr).fail(errHdlr);
        });

        waitsForSpies([okHdlr, errHdlr], 'login timeout');
        runs(function(){
            expect(errHdlr).not.toHaveBeenCalled();
            if(0 < errHdlr.callCount) {
                jasmine.log('errHdlr called with:');
                jasmine.log(errHdlr.mostRecentCall.args);
            }
            expect(okHdlr).toHaveBeenCalled();
            expect(rhoconnect.isLoggedIn()).toBeTruthy();
        });

        runs(function(){
            jasmine.log('logout');
            rhoconnect.logout().done(okHdlr).fail(errHdlr);
        });

        waitsForSpies([okHdlr, errHdlr], 'logout timeout');
        runs(function(){
            expect(errHdlr).not.toHaveBeenCalled();
            if(0 < errHdlr.callCount) {
                jasmine.log('errHdlr called with:');
                jasmine.log(errHdlr.mostRecentCall.args);
            }
            expect(okHdlr).toHaveBeenCalled();
            expect(rhoconnect.isLoggedIn()).not.toBeTruthy();
        });
    });

    it("should fail to login with wrong credentials", function() {
        var okHdlr = jasmine.createSpy('for ok');
        var errHdlr = jasmine.createSpy('for errors');

        expect(rhoconnect.rho.notify.SyncNotification).toBeDefined();
        expect(rhoconnect.login).toBeDefined();
        expect(rhoconnect.isLoggedIn).toBeDefined();

        rhoconnect.login(userlogin, wrongpass, new rhoconnect.rho.notify.SyncNotification()).done(okHdlr).fail(errHdlr);

        waitsForSpies([okHdlr, errHdlr], 'login timeout');
        runs(function(){
            expect(okHdlr).not.toHaveBeenCalled();
            if(0 < okHdlr.callCount) {
                jasmine.log('okHdlr called with:');
                jasmine.log(okHdlr.mostRecentCall.args);
            }
            expect(errHdlr).toHaveBeenCalled();
            expect(rhoconnect.isLoggedIn()).not.toBeTruthy();
        });
    });

*/
    it("should run syncAllSources ok", function() {
        var okHdlr = jasmine.createSpy('for ok');
        var errHdlr = jasmine.createSpy('for errors');

        expect(rhoconnect.rho.notify.SyncNotification).toBeDefined();
        expect(rhoconnect.login).toBeDefined();
        expect(rhoconnect.syncAllSources).toBeDefined();

        runs(function(){
            rhoconnect.login(userlogin, userpass, new rhoconnect.rho.notify.SyncNotification()).done(okHdlr).fail(errHdlr);
        });

        waitsForSpies([okHdlr, errHdlr], 'login timeout');
        runs(function(){
            expect(errHdlr).not.toHaveBeenCalled();
            if(0 < errHdlr.callCount) {
                jasmine.log('errHdlr called with:');
                jasmine.log(errHdlr.mostRecentCall.args);
            }
            expect(okHdlr).toHaveBeenCalled();
            expect(rhoconnect.isLoggedIn()).toBeTruthy();
        });

        runs(function(){
            var q ="INSERT INTO changed_values (source_id,object,attrib,value,update_type,sent) VALUES (1,5266,'zip','test-value-12345','update',0)";
            rhoconnect.rho.storage.executeSql(q).done(okHdlr).fail(errHdlr);
        });
        waitsForSpies([okHdlr, errHdlr], 'changed value insert');
        runs(function(){
            expect(errHdlr).not.toHaveBeenCalled();
            if(0 < errHdlr.callCount) {
                jasmine.log('errHdlr called with:');
                jasmine.log(errHdlr.mostRecentCall.args);
            }
            expect(okHdlr).toHaveBeenCalled();
            expect(rhoconnect.isLoggedIn()).toBeTruthy();
        });

        runs(function(){
            rhoconnect.syncAllSources().done(okHdlr).fail(errHdlr)
        });
/*

        waitsForSpies([okHdlr, errHdlr], 'syncAllSources timeout');
        runs(function(){
            expect(errHdlr).not.toHaveBeenCalled();
            if(0 < errHdlr.callCount) {
                jasmine.log('errHdlr called with:');
                jasmine.log(errHdlr.mostRecentCall.args);
            }
            expect(okHdlr).toHaveBeenCalled();
            expect(rhoconnect.isLoggedIn()).toBeTruthy();
        });
*/
    });

});