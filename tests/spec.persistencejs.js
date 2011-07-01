describe("Persistence.js integration use cases", function(){

    beforeEach(function(){
        models = [
            {name: 'Product', fields: [
                {name: 'brand',     type: 'string'},
                {name: 'name',      type: 'string'},
                {name: 'sku',       type: 'string'},
                {name: 'price',     type: 'string'},
                {name: 'quantity',  type: 'string'}
                ]},
            {name: 'Customer', fields: [
                {name: 'first',   type: 'string'},
                {name: 'last',    type: 'string'},
                {name: 'phone',   type: 'string'},
                {name: 'email',   type: 'string'},
                {name: 'address', type: 'string'},
                {name: 'city',    type: 'string'},
                {name: 'state',   type: 'string'},
                {name: 'zip',     type: 'string'},
                {name: 'lat',     type: 'string'},
                {name: 'long',    type: 'string'}
                ]}   /*,
            {name: 'Order', fields: [
                {name: 'unmber',       type: 'int'},
                {name: 'productName',  type: 'string'},
                {name: 'customerName', type: 'string'},
                {name: 'address',      type: 'string'},
                {name: 'phone',        type: 'string'}
                ]}*/
        ];
    });

    describe("API", function(){
        it("should have methods defined", function() {
            expect(rhoconnect.rho.notify.SyncNotification).toBeDefined();
            expect(rhoconnect.isLoggedIn).toBeDefined();
            expect(rhoconnect.login).toBeDefined();
            expect(rhoconnect.logout).toBeDefined();

            expect(persistence).toBeDefined();
            expect(persistence.store.rhoconnect).toBeDefined();
        });

    });

    describe("USE CASE: User initialize API with model definitions", function(){

        it("should be initialized with models", function() {
            var okHdlr = jasmine.createSpy('for ok');
            var errHdlr = jasmine.createSpy('for errors');

            expect(rhoconnect.init).toBeDefined();

            rhoconnect.init(models, 'persistencejs', false /*no data reset*/).done(okHdlr).fail(errHdlr);

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

    describe("USE CASE: User login with proper credentials", function(){
        beforeEach(function(){
            rhoconnect.logout();
        });

        it("should login ok with proper credentials", function() {
            var okHdlr = jasmine.createSpy('for ok');
            var errHdlr = jasmine.createSpy('for errors');

            //expect(rhoconnect.isLoggedIn()).not.toBeTruthy();

            rhoconnect.login(userlogin, userpass, true /*do db init*/).done(okHdlr).fail(errHdlr);

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

            //expect(rhoconnect.isLoggedIn()).not.toBeTruthy('for logged in status');

            rhoconnect.login(userlogin, wrongpass, true /*do db init*/).done(okHdlr).fail(errHdlr);

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

    it("USE CASE: read records", function() {
        var okHdlr = jasmine.createSpy('for ok');
        var errHdlr = jasmine.createSpy('for errors');

        expect(rhoconnect.login).toBeDefined();
        expect(rhoconnect.syncAllSources).toBeDefined();


        runs(function(){
            var that = this;
            rhoconnect.login(userlogin, userpass, true).fail(errHdlr).done(function(){
                rhoconnect.init(models, 'persistencejs').fail(errHdlr).done(function(){
                    that.model = rhoconnect.dataAccessObjects()['Customer'];
                    jasmine.log('first sync');
                    rhoconnect.syncAllSources().fail(errHdlr).done(function(){
//                        that.customers = [];
                        persistence.loadFromRhoConnect(function() {
//                            that.model.all().each(null /*no tx*/, function(customer){
//                                that.customers.push(customer);
//                            });
                            okHdlr();
                        });
                    });
                });
            });
        });

        waitsForSpies([okHdlr, errHdlr], 'first sync timeout', 5000);
        runs(function(){
            var that = this;
            expect(errHdlr).not.toHaveBeenCalled();
            if(0 < errHdlr.callCount) {
                jasmine.log('errHdlr called with:');
                jasmine.log(errHdlr.mostRecentCall.args);
            }
            expect(okHdlr).toHaveBeenCalled();
            that.model.all().count(null /*no tx*/, function(number){
                jasmine.log('there are ' +number +' records');
                expect(number).toBeGreaterThan(0);
            });
//            expect(this.customers).toBeDefined();
//            expect(this.customers.length).toBeDefined();
//            expect(this.customers.length).toBeGreaterThan(0);
        });

        runs(function(){
            var that = this;
            persistence.loadFromRhoConnect(function() {
                var FIRST_NAME = '---firstName';
                var SECOND_NAME = '---secondName';
                var SUFFIX = '--changed';

                var record = null;
                that.model.all().each(null /*no tx*/, function(customer){
                    if (!record &&
                            (customer.first == FIRST_NAME && customer.last == SECOND_NAME) ||
                            (customer.first == FIRST_NAME+SUFFIX && customer.last == SECOND_NAME+SUFFIX)
                            ) {
                        record = customer;
                    }
                });

                if (!record) {
                    jasmine.log("record wasn't found, going to create..");
                    record = new that.model();
                    record.first = FIRST_NAME;
                    record.last = SECOND_NAME;
                    persistence.add(record);
                } else {
                    jasmine.log("record was found");
                    if (record.first == FIRST_NAME) {
                        jasmine.log("record is original, going to change..");
                        record.first = FIRST_NAME +SUFFIX;
                        record.last = SECOND_NAME +SUFFIX;
                    } else {
                        jasmine.log("record is changed, going to delete..");
                        persistence.remove(record);
                    }

                }
                persistence.flush();
                persistence.saveToRhoConnect(function() {
                    jasmine.log('second sync');
                    rhoconnect.syncAllSources().fail(errHdlr).done(okHdlr);
                });
            });
        });

        waitsForSpies([okHdlr, errHdlr], 'second sync timeout', 5000);
        runs(function(){
            expect(errHdlr).not.toHaveBeenCalled();
            if(0 < errHdlr.callCount) {
                jasmine.log('errHdlr called with:');
                jasmine.log(errHdlr.mostRecentCall.args);
            }
            expect(okHdlr).toHaveBeenCalled();
        });
    });
});