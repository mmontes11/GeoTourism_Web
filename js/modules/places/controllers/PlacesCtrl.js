'use strict';

define([
    '../module'
], function (module) {
    module.controller('PlacesCtrl', ['$scope', '$q', '$timeout', 'FeatureService', 'Cities', 'City', 'TIPs', 'TIP', 'User', "Stats",
        'FBStorageService', 'AuthAdminService', 'AuthFBService', 'NotificationService', 'DialogService', 'ValidationService',
        function ($scope, $q, $timeout, FeatureService, Cities, City, TIPs, TIP, User, Stats,
                  FBStorageService, AuthAdminService, AuthFBService, NotificationService, DialogService, ValidationService) {

            $scope.isAuthenticated = function () {
                return AuthAdminService.isAuthenticated;
            };
            $scope.isAuthFB = function () {
                return AuthFBService.isAuthFB;
            };
            $scope.getFBUserId = function () {
                return FBStorageService.getUserID();
            };
            $scope.filtersEnabled = false;
            $scope.filtersEmpty = true;
            $scope.types = TIP.getTypes();
            $scope.selectedTypes = [];
            $scope.cities = Cities.query();
            $scope.selectedCities = [];
            $scope.selectedFriends = [];
            $scope.friends = [];
            $scope.allowAddTIPs = false;
            $scope.loading = false;
            $scope.statsEnabled = false;
            $scope.heatMapEnabled = false;
            $scope.TIPIDs = [];

            $scope.addTIP = function () {
                if ($scope.isAuthenticated() || $scope.isAuthFB()){
                    $scope.displayHelpMessage();
                    $scope.allowAddTIPs = true;
                }else{
                    NotificationService.displayMessage("You need to be logged or Admin to perform this operation");
                }
            };

            $scope.finishAddTIPs = function () {
                $scope.allowAddTIPs = false;
            };

            $scope.displayHelpMessage = function () {
                NotificationService.displayMessage("Click on the map to create Places");
            };

            $scope.$watch('isAuthenticated()', function (newVal) {
                if (angular.isDefined(newVal) && !newVal) {
                    $scope.allowAddTIPs = false;
                }
            });
            $scope.$watch('isAuthFB() && getFBUserId()', function (newVal) {
                if (angular.isDefined(newVal)) {
                    if (newVal){
                        User.getFriends().$promise
                            .then(function (friends) {
                                $scope.friends = friends;
                            });
                    }else{
                        $scope.allowAddTIPs = false;
                    }
                }
            });

            $scope.$watchCollection('selectedCities', function (newVal, oldVal) {
                if (ValidationService.arrayChanged(newVal, oldVal)) {
                    requestFeatures();
                }
            });
            $scope.$watchCollection('selectedTypes', function (newVal, oldVal) {
                if (ValidationService.arrayChanged(newVal, oldVal)) {
                    requestFeatures();
                }
            });
            $scope.$on('peopleSelector.value', function (event, favouritedBy) {
                $scope.favouritedBy = favouritedBy;
            });
            $scope.$on('socialChips.selectedFriends', function (event, selectedFriends) {
                $scope.selectedFriends = selectedFriends;
            });

            var initializing = true;
            $scope.$watch('favouritedBy', function () {
                if (initializing) {
                    $timeout(function () { initializing = false; });
                } else { requestFeatures(); }
            });
            $scope.$watchCollection('selectedFriends', function () {
                if (initializing) {
                    $timeout(function () { initializing = false; });
                } else { requestFeatures(); }
            });

            $scope.$watch('selectedFriends.length || selectedCities.length  || selectedTypes.length || favouritedBy', function () {
                $scope.filtersEmpty = !(angular.isDefined($scope.favouritedBy) || ($scope.selectedFriends.length > 0) ||
                ($scope.selectedCities.length > 0) || ($scope.selectedTypes.length > 0));
            });

            $scope.clearFilters = function () {
                $scope.favouritedBy = undefined;
                $scope.selectedFriends = [];
                $scope.selectedCities = [];
                $scope.selectedTypes = [];

                $scope.$broadcast('peopleSelector.reset', undefined);
                $scope.$broadcast('socialChips.reset', []);
            };

            var activateLoading = function () {
                $scope.loading = true;
            };

            var disableLoading = function () {
                $scope.loading = false;
            };

            var requestFeatures = function () {
                var types = _.map($scope.selectedTypes, function (type) {
                    return type.id;
                });
                var cities = _.map($scope.selectedCities, function (city) {
                    return city.id;
                });
                var URLparams = {
                    types: types,
                    cities: cities
                };
                if ($scope.isAuthFB()) {
                    URLparams["favouritedBy"] = $scope.favouritedBy;
                    if (angular.isDefined($scope.favouritedBy) && $scope.favouritedBy == 1 && !_.isEmpty($scope.selectedFriends)) {
                        URLparams["friends"] = _.map($scope.selectedFriends, function (friend) {
                            return friend.facebookUserId;
                        });
                    }
                } else {
                    URLparams["favouritedBy"] = undefined;
                    URLparams["friends"] = undefined;
                }

                activateLoading();
                TIPs.query(URLparams).$promise
                    .then(function (features) {
                        $scope.markerclusterfeatures = features;
                        $scope.TIPIDs = _.map(features, function (feature) {
                            return feature.id;
                        });
                    }, function (response) {
                        if (response.status == 500) {
                            NotificationService.displayMessage("Error retrieving TIPS");
                        }
                    }).finally(function(){
                        disableLoading();
                    });
            };
            requestFeatures();

            $scope.$watchCollection("TIPIDs", function (TIPIDs) {
                if (angular.isDefined(TIPIDs) && angular.isDefined($scope.heatMapEnabled) && $scope.heatMapEnabled) {
                    if (TIPIDs.length > 0) {
                        Stats.getStats(getRequestStatsParams(),$scope.TIPIDs).$promise
                            .then(function (heatdata) {
                                $scope.heatdata = heatdata;
                            });
                    } else {
                        clearStats();
                    }
                }
            });

            var getCreateTIP = function(place){
                if ($scope.isAuthenticated()){
                    return TIP.createAdmin(place);
                }
                if ($scope.isAuthFB()){
                    return TIP.createSocial(place);
                }
                return undefined;
            };

            $scope.$watch('locationclicked', function (location) {
                if (($scope.isAuthFB || $scope.isAuthenticated()) && $scope.allowAddTIPs && angular.isDefined(location)){
                    var locationFeature = FeatureService.layer2WKT(location);
                    activateLoading();
                    City.get({location: locationFeature}).$promise.finally(disableLoading)
                        .then(function () {
                            return DialogService.showAddPlaceDialog()
                        }, function () {
                            NotificationService.displayMessage("The place should be located in a existing city");
                            return $q.reject();
                        })
                        .then(function (place) {
                            place["geometry"] = locationFeature;
                            activateLoading();
                            return getCreateTIP(place).$promise.finally(disableLoading)
                        }, function () {
                            return $q.reject();
                        })
                        .then(function () {
                            requestFeatures();
                            NotificationService.displayMessage("Place created!");
                            $scope.allowAddTIPs = false;
                        }, function (response) {
                            if (response && response.status == 500) {
                                NotificationService.displayMessage("Error creating Place");
                            }
                        });

                }
            });

            $scope.showPlaceDialog = function (layer) {
                DialogService.showPlaceDialog(layer.customFeature)
                    .then(function (operation) {
                        if (operation.delete != undefined && operation.delete) {
                            return DialogService.showConfirmDeleteTIPDialog(layer.customFeature.id, "Delete Place?", "Yes", "Cancel");
                        } else if (operation.edit != undefined) {
                            return {edit: operation.edit};
                        } else {
                            return $q.reject();
                        }
                    })
                    .then(function (operation) {
                        if (operation.edit == undefined) {
                            activateLoading();
                            return TIP.delete({id: layer.customFeature.id}).$promise.finally(disableLoading)
                        } else {
                            return {edit: operation.edit};
                        }
                    }, function (error) {
                        return $q.reject(error);
                    })
                    .then(function (operation) {
                        if (operation.edit == undefined) {
                            $scope.boundingboxlayers.removeLayer(layer);
                            NotificationService.displayMessage("Place deleted!");
                        } else {
                            if (operation.edit) {
                                requestFeatures();
                            }
                        }
                    }, function (error) {
                        if (error) {
                            if (error.status == 500) {
                                NotificationService.displayMessage("Error deleting Place");
                            }
                            if (error.confirm == false) {
                                $scope.showPlaceDialog(layer);
                            }
                        }
                    });

            };

            var getRequestStatsParams = function(){
                return _.pick($scope.statsParams,'metricID',"fromDate","toDate");
            };

            $scope.addStats = function () {
                DialogService.showStatsDialog($scope.statsParams)
                    .then(function (statsResponse) {
                        if ($scope.TIPIDs.length == 0) {
                            return {
                                data: []
                            };
                        }
                        $scope.heatMapEnabled = true;
                        $scope.statsParams = {
                            metricID: statsResponse.metricID
                        };
                        if (angular.isDefined(statsResponse.fromDate)){
                            $scope.statsParams ['fromDate'] = statsResponse.fromDate;
                        }
                        if (angular.isDefined(statsResponse.toDate)){
                            $scope.statsParams ['toDate'] = statsResponse.toDate;
                        }
                        return Stats.getStats(getRequestStatsParams(),$scope.TIPIDs).$promise.finally(disableLoading);
                    })
                    .then(function (heatdata) {
                        $scope.heatdata = heatdata;
                        if (heatdata.data.length == 0) {
                            clearStats();
                            NotificationService.displayMessage("Not enough data to show Stats");
                        }
                    }, function (response) {
                        if (response && response.status >= 400) {
                            clearStats();
                            NotificationService.displayMessage("Stats not Available");
                        }
                    });
            };


            var clearStats = function () {
                $scope.heatdata = {
                    max: 0,
                    data: []
                };
            };

            $scope.disableStats = function () {
                clearStats();
                $scope.statsParams = undefined;
                $scope.heatMapEnabled = false;
            };

            $scope.$watch('layerclicked', function (layerClicked) {
                if (angular.isDefined(layerClicked)) {
                    var typeClicked = layerClicked.typeClicked;
                    var layer = layerClicked.layer;
                    if (typeClicked == "Point") {
                        $scope.showPlaceDialog(layer);
                        $scope.layerclicked = undefined;
                    }
                }
            });
        }
    ])
    ;
})
;