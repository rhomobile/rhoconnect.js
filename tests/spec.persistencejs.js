describe("Persistence.js integration", function(){

    var models;
    
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

    describe("Use cases", function() {

        describe("User session", function(){

            var testName = 'testCustomerName';

            var okHdlr;
            var errHdlr;
            var model;

            beforeEach(function(){
                okHdlr = jasmine.createSpy('for ok');
                errHdlr = jasmine.createSpy('for errors');
                model = rhoconnect.dataAccessObjects()['Customer'];
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

            it("should initialize API with models", function() {
                var okHdlr = jasmine.createSpy('for ok');
                var errHdlr = jasmine.createSpy('for errors');

                expect(rhoconnect.init).toBeDefined();

                rhoconnect.init(models, 'persistencejs', true /*do data reset*/).done(okHdlr).fail(errHdlr);

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

            it("should have no records on session start", function(){
                runs(function(){
                    var that = this;

                    persistence.loadFromRhoConnect(function() {
                        that.customers = [];
                        model.all().each(null /*no tx*/, function(customer){
                            that.customers.push(customer);
                        });
                        okHdlr();
                    });
                });

                waitsForSpies([okHdlr, errHdlr], 'first read timeout', 5000);

                runs(function(){
                    var that = this;
                    expect(okHdlr).toHaveBeenCalled();
                    expect(errHdlr).not.toHaveBeenCalled();
                    expect(that.customers).toBeDefined();
                    expect(that.customers.length).toBeDefined();
                    expect(that.customers.length).toEqual(0);
                });
            });

            it("should add record", function(){

                runs(function(){
                    var that = this;

                    var customer = new model();
                    customer.first = testName;

                    persistence.add(customer);
                    persistence.flush(function(){
                        persistence.saveToRhoConnect(function(){
                            okHdlr();
                        });
                    });
                });

                waitsForSpies([okHdlr, errHdlr], 'first read timeout', 5000);

                runs(function(){
                    var that = this;
                    expect(okHdlr).toHaveBeenCalled();
                    expect(errHdlr).not.toHaveBeenCalled();
                });
            });

            it("should read all records", function(){
                runs(function(){
                    var that = this;

                    persistence.loadFromRhoConnect(function() {
                        that.customers = [];
                        model.all().each(null /*no tx*/, function(customer){
                            that.customers.push(customer);
                        });
                        okHdlr();
                    });
                });

                waitsForSpies([okHdlr, errHdlr], 'first read timeout', 5000);

                runs(function(){
                    var that = this;
                    expect(okHdlr).toHaveBeenCalled();
                    expect(errHdlr).not.toHaveBeenCalled();
                    expect(that.customers).toBeDefined();
                    expect(that.customers.length).toBeDefined();
                    expect(that.customers.length).toEqual(1);
                });
            });

            it("should search records", function(){
                runs(function(){
                    var that = this;

                    persistence.loadFromRhoConnect(function() {
                        that.customers = [];
                        model.findBy(persistence, null /*no tx*/, "first", testName, function(customer){
                            that.customers.push(customer);
                        });
                        okHdlr();
                    });
                });

                waitsForSpies([okHdlr, errHdlr], 'first read timeout', 5000);

                runs(function(){
                    var that = this;
                    expect(okHdlr).toHaveBeenCalled();
                    expect(errHdlr).not.toHaveBeenCalled();
                    expect(that.customers).toBeDefined();
                    expect(that.customers.length).toBeDefined();
                    expect(that.customers.length).toEqual(1);
                });
            });


        });
    });
});