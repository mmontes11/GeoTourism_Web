'use strict';

define([
    '../app'
], function(app){
    app.factory('TokenInterceptor', ['$q', '$injector', 'BrowserService','AuthAdminService',
        function($q,$injector,BrowserService,AuthAdminService){
        return {
            request: function(config){
                config.headers = config.headers || {};
                if (BrowserService.getSession('token')){
                    config.headers.Authorization = 'Bearer ' + BrowserService.getSession('token');
                }
                return config || $q.when(config);
            },
            requestError: function(rejection){
                return $q.reject(rejection);
            },
            response: function(response){
                if (response != null && response.status == 200 && BrowserService.getSession('token') && !AuthAdminService.isAuthenticated){
                    AuthAdminService.isAuthenticated = true;
                }
                return response || $q.when(response);
            },
            responseError: function(rejection){
                if (rejection != null && rejection.status === 401 && (BrowserService.getSession('token') || AuthAdminService.isAuthenticated)) {
                    BrowserService.deleteSession('token');
                    AuthAdminService.isAuthenticated = false;
                    $injector.get('$state').transitionTo('admin');
                    $injector.get('$mdDialog').cancel();
                    $injector.get('NotificationService').displayMessage("Invalid or expired Admin token");
                }
                return $q.reject(rejection);
            }
        };
    }]);

    app.config(['$httpProvider', function($httpProvider) {
        $httpProvider.interceptors.push('TokenInterceptor');
    }]);
});