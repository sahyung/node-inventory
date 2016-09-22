var assert = require('assert'),
    mongoose = require('mongoose'),
    fs = require('fs.extra'),
    traverse = require('traverse'),
    log = require('tracer').colorConsole(),
    async = require('async'),
    Inventory = require('../index.js');
    autoIncrement = require('mongoose-auto-increment');
    config = {
      baciro: {
        protocol: 'http',
        host: 'localhost',
        port: 3002
      },
      database: {
        host: 'localhost',
        port: 27017,
        name: 'backgrid'
      },
      inventory: {
        jar: '/inventory/jar',
        csd: '/inventory/csd',
        cfd: '/inventory/csd',
        bld: '/inventory/bld',
        iri: '/inventory/iri',
        flow: '/inventory/iri',
        ssd: '/inventory/ssd',
        lmd: '/inventory/lmd',
        xml: '/inventory/xml'
      }
    };

mongoose.connect(config.database.host +':'+ config.database.port+ '/' + config.database.name);
autoIncrement.initialize(mongoose);
config.db = mongoose;

var param = {
  apikeyid: 'a779fca371b7c3795d65b8915dca014aa1bba95d622f4cec7da1375112cbecc0',
  mod: {
    inventory: require('./modInventory.js'),
    user: require('./modUser.js')
  },
  findUserByApikey: function findUserByApikey(apikey, arg1, arg2) {
                      var db = config.db,
                          user = require('./modUser.js'),
                          retval, callback, field = null;

                      if (typeof arg1 == 'function') {
                        callback = arg1;
                      } else {
                        callback = arg2;
                        field = arg1;
                      }

                      user.findOne({'apikey.apikey': apikey }, field, function(err, data){
                        if (err) callback(err);
                        if (data) { callback(null, data); } else {
                          console.log(apikey);
                          console.log(data);
                          callback(true);
                        }
                      });
                    },
  updateInventory: function updateInventory(data, apikey, cb) {
                    var items = [],
                        inventoryModel = require('./modInventory.js');

                    var invent = traverse(data.inventoryDir).reduce(function cbTrav (leaf, x) {
                      if (this.isLeaf) leaf.push(x);
                      return leaf;
                    }, []);

                    log.debug(invent);
                    log.debug(typeof invent[0]);

                    async.map(invent, function iter(item, callback) {
                      if ((typeof item == 'undefined') || (isEmptyObject(item))) {
                        callback(null, []);
                      } else {
                        inventoryModel.findOne({ 'filename': item }, function (err, data) {
                          if (err) {
                            callback(err);
                          } else {
                            if (data) {
                              callback(null, data._id);
                            } else {
                              async.waterfall([
                                function start (cback) {
                                  log.debug(item);
                                  fs.exists(item, function (exists) {
                                    if (exists) {
                                      fs.unlinkSync(item);
                                      cback(null);
                                    } else {
                                      cback(null);
                                    }
                                  });
                                },
                                function sync (cback) {
                                  Inventory.syncDir(apikey, function(err, data) {
                                    console.log(data);
                                    if (err) {
                                      cback(err);
                                    } else {
                                      cback(null, '');
                                    }
                                  });
                                }
                              ], function finalize (err, result) {
                                callback(err, result);
                              });
                            }
                          }
                        });
                      }
                    }, function hasil (err, result) {
                      if (err) { cb(err); } else {
                        var tampil = result.filter(function(elem, pos) {
                          return result.indexOf(elem) == pos;
                        });
                        console.log(tampil);
                        console.log(result);
                        data.inventories = tampil.clean('');
                        data.save(function(err) {
                          if (err) { cb(err); } else {
                            cb(null, data.inventories);
                          }
                        });
                      }
                    });
                  }
};

function isEmptyObject(obj) {
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      return false;
    }
  }
  return true;
}

Array.prototype.clean = function(deleteValue) {
  for (var i = 0; i < this.length; i++) {
    if (this[i] == deleteValue) {
      this.splice(i, 1);
      i--;
    }
  }
  return this;
};

describe('Inventory', function() {
  inv = new Inventory(config, param);

  describe('#Prepare file for test', function() {
    it('Prepare file one.csd & casetwo.jar', function(done){
      try {
        fs.copy('./test/one.csd.rename', '/test/one.csd');
        fs.copy('./test/casetwo.jar.rename', '/test/casetwo.jar');
        done();
      } catch (err) {
        log.error(err);
      }
    });
  });

  describe('#Put Inventory', function() {
    it('Put Inventory (\'csd\', \'one/one\', \'test/one.csd\', \''+param.apikeyid+'\')', function(done){
      inv.put('csd', 'one/one', 'test/one.csd', param.apikeyid, function(e,r){
        log.error(e);
        log.log(r);
        done();
      });
    });

    it('Put Inventory (\'jar\', \'casetwo\', \'test/casetwo.jar\', \''+param.apikeyid+'\')', function(done){
      inv.put('jar', 'casetwo', 'test/casetwo.jar', param.apikeyid, function(e,r){
        log.error(e);
        log.log(r);
        done();
      });
    });
  });

  describe('#Get Inventory', function() {
    it('Inventory of user (without parameter)', function(done) {
      inv.get(function(e, r){
        log.error(e);
        log.log(r);
        assert.equal(e, null);
        assert(typeof r, 'object');
        if(typeof r[0] == 'object'){
          iid = r[0].iid;
        }
        done();
      });
    });

    it('One inventory of user (iid)', function(done){
      inv.getOne(iid, function(e, r){
        assert.equal(e, null);
        assert(typeof r, 'object');
        done();
      });
    }
    );

    it('Get Inventory of user (\'csd\', \'one/one\', \''+param.apikeyid+'\')', function(done){
      inv.getInventory('csd', 'one/one',param.apikeyid, function(e, r){
        assert.equal(e, null);
        assert(r.indexOf('one/one.csd'));
        log.error(e);
        log.log(r);
        done();
      });
    });

    it('Get Inventory of user (\'jar\', \'casetwo\', \''+param.apikeyid+'\')', function(done){
      inv.getInventory('jar', 'casetwo',param.apikeyid, function(e, r){
        assert.equal(e, null);
        assert(r.indexOf('casetwo.jar'));
        log.error(e);
        log.log(r);
        done();
      });
    });
  });

});
