(function($, Ext) {

    var data = {
        //text: 'Sources',
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

    var LOG = new RhoSync.rho.Logger('application.js');

    Ext.setup({
        // setup options goes here if needed
    });

    var theApp = new Ext.Application({
        launch: doAppLaunch
    });

    function doAppLaunch() {
        initRhosync();
        initUI();
    }

    function initRhosync() {
    }

    function doLogin(username, password){
        RhoSync.login(username, password, new RhoSync.rho.notify.SyncNotification()).done(function(){
            mainPanel.setActiveItem('sourcesList');
            updateLoggedInState();
        }).fail(function(errCode, err){
            Ext.Msg.alert('Login error', err, Ext.emptyFn);
            LOG.error('Login: ' +errCode +': ' +err);
        });
    }

    function doLogout(){
        RhoSync.logout().done(function(){
            loginForm.reset();
            updateLoggedInState();
        }).fail(function(errCode, err){
            Ext.Msg.alert('Logout error', err, Ext.emptyFn);
            LOG.error('Logout: ' +errCode +': ' +err);
        });
    }

    function doSync(){
        Ext.Msg.alert('Hush-hush-hush..', 'Not implemented yet :)', Ext.emptyFn);
    }

    function updateLoggedInState() {
        if (RhoSync.isLoggedIn()) {
            loginButton.hide();
            logoutButton.show();
            syncButton.show();
        } else {
            loginButton.show();
            logoutButton.hide();
            syncButton.hide();
        }
        topBar.doLayout();
    }

    var mainPanel = null;
    var loginButton = null;
    var logoutButton = null;
    var loginForm = null;
    var syncForm = null;
    var sourcesList = null;
    var topBar = null;
    var bottomBar = null;

    function buildSourcesList(id){
        Ext.regModel('ListItem', {
            fields: [{name: 'text', type: 'string'}]
        });

        var store = new Ext.data.TreeStore({
            model: 'ListItem',
            root: data,
            proxy: {
                type: 'memory',
                reader: {
                    type: 'tree',
                    root: 'items'
                }
            }
        });

        var list = new Ext.NestedList({
            id: id,
            title: 'Sources',
            fullscreen: false,
            //dockedItems: [bottomBar],
            displayField: 'text',
            store: store
        });


        list.toolbar.add({xtype: 'spacer'});
        list.toolbar.add({xtype: 'spacer'});
        list.toolbar.add({xtype: 'spacer'});
        list.toolbar.add(logoutButton);
        list.toolbar.add({xtype: 'spacer'});
        list.toolbar.add(loginButton);
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
                    title: 'Login',
                    dock : 'top',
                    items: [
                        {
                            xtype: 'button',
                            text: 'Cancel',
                            ui: 'back',
                            handler: function() {
                                //loginForm.reset();
                                mainPanel.setActiveItem('sourcesList');
                            }
                        }
                    ]
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
                {xtype: 'spacer'},
                {
                    xtype: 'button',
                    text: 'Do login',
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

        loginButton = new Ext.Button({
            text: 'Login',
            hidden: isLoggedIn,
            handler: function(){
                mainPanel.setActiveItem('loginForm');
            }
        });

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

        topBar = new Ext.Toolbar({
            dock : 'top',
            title: 'Rhosync.js demo',
            items: [loginButton, logoutButton]
        });

        bottomBar = new Ext.Toolbar({
            dock : 'bottom',
            //title: 'My Toolbar',
            items: [
                {
                    text: 'Synch'
                }
            ]
        });

        sourcesList = buildSourcesList('sourcesList');
        loginForm = buildLoginForm('loginForm');

        mainPanel = new Ext.Panel({
            fullscreen: true,
            layout: 'card',
            //dockedItems: [topBar, bottomBar],
            items: [loginForm, sourcesList]
        });
        mainPanel.setActiveItem('sourcesList');

    }



})(jQuery, Ext);





