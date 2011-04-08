(function($, Ext) {

    var LOG = new RhoSync.rho.Logger('application.js');

    Ext.setup({
        // setup options goes here if needed
    });

    var theApp = new Ext.Application({
        launch: doAppLaunch
    });

/*
    var data = {
        text: 'Sources',
        items: [{
            text: 'Products',
            items: [{
                text: 'product #1',
                leaf: true
            },{
                text: 'product #2',
                leaf: true
            },{
                text: 'product #3',
                leaf: true
            }]
        },{
            text: 'Customers',
            items: [{
                text: 'customer #1',
                leaf: true
            },{
                text: 'customer #2',
                leaf: true
            },{
                text: 'customer #3',
                leaf: true
            }]
        }]
    };
*/

    function doAppLaunch() {
        var msg = Ext.Msg.alert('Application starting', 'Wait please..', Ext.emptyFn);
        //var msg = showPopup('Application starting', 'Wait please..');
        initRhosync().done(function(){
            msg.hide();
            initUI();
        }).fail(function(error){
            Ext.Msg.alert('Error', error, Ext.emptyFn);
        });
    }

    function initRhosync() {
        var models = [
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
                ]/*,
                associations: [
                    {type: 'belongsTo', model: 'Product', primaryKey: 'unique_id', foreignKey: 'prod_id'}
                ]*/
            }
        ];

        $.each(models, function(idx, model){
            Ext.regModel(model.name, model);
        });

        return RhoSync.init(models/*, 'native'*/);
    }

    function showPopup(title, msg) {
        var popup = null;
        if (!popup) {
            popup = new Ext.Panel({
                floating: true,
                modal: true,
                centered: true,
                width: 300,
                height: 200,
                styleHtmlContent: true,
                scroll: 'vertical',
                html: '<p>message_placeholder</p>',
                dockedItems: [
                    {
                        dock: 'top',
                        xtype: 'toolbar',
                        title: 'Overlay Title'
                    }
                ]
            });
        }
        popup.show('pop');
        popup.dockedItems.get(0).setTitle(title);
        popup.body.update('<p class="popup-text">' + msg +'</p>');
        return popup;
    }

    function showError(title, errCode, err) {
        Ext.Msg.alert(title, err || errCode, Ext.emptyFn);
        LOG.error(title +': ' +errCode +': ' +err);
    }

    function doLogin(username, password){
        RhoSync.login(username, password, new RhoSync.rho.notify.SyncNotification()).done(function(){
            mainPanel.setActiveItem('sourcesList');
            updateLoggedInState();
        }).fail(function(errCode, err){
            showError('Login error', errCode, err);
        });
    }

    function doLogout(){
        RhoSync.logout().done(function(){
            loginForm.reset();
            updateLoggedInState();
        }).fail(function(errCode, err){
            showError('Logout error', errCode, err);
        });
    }

    function updateLoggedInState() {
        if (RhoSync.isLoggedIn()) {
            mainPanel.setActiveItem('sourcesList');
            logoutButton.show();
            syncButton.enable();

        } else {
            mainPanel.setActiveItem('loginForm');
            logoutButton.hide();
            syncButton.disable();
        }
        mainPanel.doLayout();
    }

    function doSync(){
        var msg = Ext.Msg.alert('Synchronizing now', 'Wait please..', Ext.emptyFn);
        RhoSync.syncAllSources().done(function(){
            msg.hide();
        }).fail(function(errCode, err){
            showError('Synchronization error', errCode, err);
        });
    }

    var mainPanel = null;
    var logoutButton = null;
    var syncButton = null;
    var loginForm = null;
    var sourcesList = null;

    function buildSourcesList(id){
//        Ext.regModel('ListItem', {
//            fields: [{name: 'text', type: 'string'}]
//        });

        var store = new Ext.data.TreeStore({
            model: 'Product',
            proxy: {
                type: 'rhosync',
                dbName: 'rhoSyncDb',
                reader: {
                    type: 'json',
                    root: 'manyProducts'
                }
            }
        });

        var list = new Ext.NestedList({
            id: id,
            title: 'Sources',
            fullscreen: false,
            displayField: 'name',
            store: store
        });


        list.toolbar.add({xtype: 'spacer'});
        list.toolbar.add({xtype: 'spacer'});
        list.toolbar.add(logoutButton);
        list.toolbar.add(syncButton);
        list.toolbar.doLayout();
        return list;
    }

    function buildLoginForm(id) {
        return new Ext.form.FormPanel({
            id: id,
            standardSubmit: false,
            dockedItems: [
                {
                    xtype: 'toolbar',
                    title: 'Sign in',
                    dock : 'top',
                    items: []
                }
            ],
            items: [
                {
                    xtype: 'textfield',
                    name : 'login',
                    label: 'Username',
                    value: 'testUserToFailAuth'
                },
                {
                    xtype: 'passwordfield',
                    name : 'password',
                    label: 'Password'
                },
                {
                    xtype: 'button',
                    text: 'Login',
                    ui: 'confirm',
                    handler: function() {
                        LOG.trace('username: ' +loginForm.getValues().login);
                        LOG.trace('password: ' +loginForm.getValues().password);
                        doLogin(loginForm.getValues().login, loginForm.getValues().password);
                    }
                }
            ]
        });
    }

    function initUI() {

        var isLoggedIn = RhoSync.isLoggedIn();

        logoutButton = new Ext.Button({
            text: 'Logout',
            hidden: !isLoggedIn,
            handler: doLogout
        });

        syncButton = new Ext.Button({
            text: 'Sync',
            hidden: !isLoggedIn,
            handler: doSync
        });

        sourcesList = buildSourcesList('sourcesList');
        loginForm = buildLoginForm('loginForm');

        mainPanel = new Ext.Panel({
            fullscreen: true,
            layout: 'card',
            items: [loginForm, sourcesList]
        });
        updateLoggedInState();

    }
})(jQuery, Ext);





