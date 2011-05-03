describe("RhoSync use cases", function(){

    describe("API", function(){
        it("should have methods defined", function() {
            expect(rhosync.rho.notify.SyncNotification).toBeDefined();
            expect(rhosync.isLoggedIn).toBeDefined();
            expect(rhosync.login).toBeDefined();
            expect(rhosync.logout).toBeDefined();
        });

    });

    describe("USE CASE: User initialize API with model definitions", function(){

        it("should be initialized with models", function() {
            var okHdlr = jasmine.createSpy('for ok');
            var errHdlr = jasmine.createSpy('for errors');

            expect(rhosync.init).toBeDefined();

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

            rhosync.init(models, 'native', null /*no progress update callback*/, false /*no data resey*/).done(okHdlr).fail(errHdlr);

            waitsForSpies([okHdlr, errHdlr], 'RhoSync init timeout', 3000);
            runs(function(){
                expect(errHdlr).not.toHaveBeenCalled();
                if(0 < errHdlr.callCount) {
                    jasmine.log('errHdlr called with:');
                    jasmine.log(errHdlr.mostRecentCall.args);
                }

                expect(rhosync.rho.getModels()).toBeDefined('models map');
                expect(rhosync.rho.engine.getSources()).toBeDefined('sources map');

                expect(rhosync.rho.getModels().Product).toBeSet('Product model');
                expect(rhosync.rho.getModels().Product.name).toBeSet('Product model');
                expect(rhosync.rho.engine.getSources().Product).toBeSet('Product source');
                expect(rhosync.rho.engine.getSources().Product.name).toBeSet('Product source');
                expect(rhosync.rho.engine.getSources().Product.id).toBeGreaterThan(0);
                expect(rhosync.rho.getModels().Product.name).toEqual(rhosync.rho.engine.getSources().Product.name);
                jasmine.log(rhosync.rho.getModels().Product.name +' source id = ' +rhosync.rho.engine.getSources().Product.id);
            });
        });
    });

/*
    describe("USE CASE: User login with proper credentials", function(){
        beforeEach(function(){
            rhosync.logout();
        });

        it("should login ok with proper credentials", function() {
            var okHdlr = jasmine.createSpy('for ok');
            var errHdlr = jasmine.createSpy('for errors');

            expect(rhosync.isLoggedIn()).not.toBeTruthy();

            rhosync.login(userlogin, userpass, new rhosync.rho.notify.SyncNotification()).done(okHdlr).fail(errHdlr);

            waitsForSpies([okHdlr, errHdlr], 'login timeout');
            runs(function(){
                expect(errHdlr).not.toHaveBeenCalled();
                if(0 < errHdlr.callCount) {
                    jasmine.log('errHdlr called with:');
                    jasmine.log(errHdlr.mostRecentCall.args);
                }
                expect(okHdlr).toHaveBeenCalled();
                expect(rhosync.isLoggedIn()).toBeTruthy();
            });
        });
    });

    describe("USE CASE: User login with wrong credentials", function(){
        beforeEach(function(){
            rhosync.logout();
        });

        it("should fail", function() {
            var okHdlr = jasmine.createSpy('for ok');
            var errHdlr = jasmine.createSpy('for errors');

            expect(rhosync.isLoggedIn()).not.toBeTruthy();

            rhosync.login(userlogin, wrongpass, new rhosync.rho.notify.SyncNotification()).done(okHdlr).fail(errHdlr);

            waitsForSpies([okHdlr, errHdlr], 'login timeout');
            runs(function(){
                expect(okHdlr).not.toHaveBeenCalled();
                if(0 < okHdlr.callCount) {
                    jasmine.log('okHdlr called with:');
                    jasmine.log(okHdlr.mostRecentCall.args);
                }
                expect(errHdlr).toHaveBeenCalled();
                expect(rhosync.isLoggedIn()).not.toBeTruthy();
            });
        });
    });

    describe("USE CASE: User logout", function(){
        beforeEach(function(){
            //runs(function(){
                rhosync.login(userlogin, userpass, new rhosync.rho.notify.SyncNotification());
            //});
        });

        it("should logout ok", function() {
            var okHdlr = jasmine.createSpy('for ok');
            var errHdlr = jasmine.createSpy('for errors');

            runs(function(){
                expect(rhosync.isLoggedIn()).toBeTruthy();
                rhosync.logout().done(okHdlr).fail(errHdlr);
            });

            waitsForSpies([okHdlr, errHdlr], 'logout timeout');
            runs(function(){
                expect(errHdlr).not.toHaveBeenCalled();
                if(0 < errHdlr.callCount) {
                    jasmine.log('errHdlr called with:');
                    jasmine.log(errHdlr.mostRecentCall.args);
                }
                expect(okHdlr).toHaveBeenCalled();
                expect(rhosync.isLoggedIn()).not.toBeTruthy();
            });
        });
    });
*/

/*
    it("should login ok with proper credentials", function() {
        var okHdlr = jasmine.createSpy('for ok');
        var errHdlr = jasmine.createSpy('for errors');

        expect(rhosync.rho.notify.SyncNotification).toBeDefined();
        expect(rhosync.login).toBeDefined();
        expect(rhosync.isLoggedIn).toBeDefined();

        runs(function(){
            rhosync.login(userlogin, userpass, new rhosync.rho.notify.SyncNotification()).done(okHdlr).fail(errHdlr);
        });

        waitsForSpies([okHdlr, errHdlr], 'login timeout');
        runs(function(){
            expect(errHdlr).not.toHaveBeenCalled();
            if(0 < errHdlr.callCount) {
                jasmine.log('errHdlr called with:');
                jasmine.log(errHdlr.mostRecentCall.args);
            }
            expect(okHdlr).toHaveBeenCalled();
            expect(rhosync.isLoggedIn()).toBeTruthy();
        });
    });

    it("should logout ok", function() {
        var okHdlr = jasmine.createSpy('for ok');
        var errHdlr = jasmine.createSpy('for errors');

        expect(rhosync.logout).toBeDefined();
        expect(rhosync.isLoggedIn).toBeDefined();

        runs(function(){
            jasmine.log('login');
            rhosync.login(userlogin, userpass, new rhosync.rho.notify.SyncNotification()).done(okHdlr).fail(errHdlr);
        });

        waitsForSpies([okHdlr, errHdlr], 'login timeout');
        runs(function(){
            expect(errHdlr).not.toHaveBeenCalled();
            if(0 < errHdlr.callCount) {
                jasmine.log('errHdlr called with:');
                jasmine.log(errHdlr.mostRecentCall.args);
            }
            expect(okHdlr).toHaveBeenCalled();
            expect(rhosync.isLoggedIn()).toBeTruthy();
        });

        runs(function(){
            jasmine.log('logout');
            rhosync.logout().done(okHdlr).fail(errHdlr);
        });

        waitsForSpies([okHdlr, errHdlr], 'logout timeout');
        runs(function(){
            expect(errHdlr).not.toHaveBeenCalled();
            if(0 < errHdlr.callCount) {
                jasmine.log('errHdlr called with:');
                jasmine.log(errHdlr.mostRecentCall.args);
            }
            expect(okHdlr).toHaveBeenCalled();
            expect(rhosync.isLoggedIn()).not.toBeTruthy();
        });
    });

    it("should fail to login with wrong credentials", function() {
        var okHdlr = jasmine.createSpy('for ok');
        var errHdlr = jasmine.createSpy('for errors');

        expect(rhosync.rho.notify.SyncNotification).toBeDefined();
        expect(rhosync.login).toBeDefined();
        expect(rhosync.isLoggedIn).toBeDefined();

        rhosync.login(userlogin, wrongpass, new rhosync.rho.notify.SyncNotification()).done(okHdlr).fail(errHdlr);

        waitsForSpies([okHdlr, errHdlr], 'login timeout');
        runs(function(){
            expect(okHdlr).not.toHaveBeenCalled();
            if(0 < okHdlr.callCount) {
                jasmine.log('okHdlr called with:');
                jasmine.log(okHdlr.mostRecentCall.args);
            }
            expect(errHdlr).toHaveBeenCalled();
            expect(rhosync.isLoggedIn()).not.toBeTruthy();
        });
    });

*/
    it("should run syncAllSources ok", function() {
        var okHdlr = jasmine.createSpy('for ok');
        var errHdlr = jasmine.createSpy('for errors');

        expect(rhosync.rho.notify.SyncNotification).toBeDefined();
        expect(rhosync.login).toBeDefined();
        expect(rhosync.syncAllSources).toBeDefined();

        runs(function(){
            rhosync.login(userlogin, userpass, new rhosync.rho.notify.SyncNotification()).done(okHdlr).fail(errHdlr);
        });

        waitsForSpies([okHdlr, errHdlr], 'login timeout');
        runs(function(){
            expect(errHdlr).not.toHaveBeenCalled();
            if(0 < errHdlr.callCount) {
                jasmine.log('errHdlr called with:');
                jasmine.log(errHdlr.mostRecentCall.args);
            }
            expect(okHdlr).toHaveBeenCalled();
            expect(rhosync.isLoggedIn()).toBeTruthy();
        });

        runs(function(){
            var q ="INSERT INTO changed_values (source_id,object,attrib,value,update_type,sent) VALUES (1,5266,'zip','test-value-12345','update',0)";
            rhosync.rho.storage.executeSql(q).done(okHdlr).fail(errHdlr);
        });
        waitsForSpies([okHdlr, errHdlr], 'changed value insert');
        runs(function(){
            expect(errHdlr).not.toHaveBeenCalled();
            if(0 < errHdlr.callCount) {
                jasmine.log('errHdlr called with:');
                jasmine.log(errHdlr.mostRecentCall.args);
            }
            expect(okHdlr).toHaveBeenCalled();
            expect(rhosync.isLoggedIn()).toBeTruthy();
        });

        runs(function(){
            rhosync.syncAllSources().done(okHdlr).fail(errHdlr)
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
            expect(rhosync.isLoggedIn()).toBeTruthy();
        });
*/
    });

});