function newSchema(Schema) {
  var userapi = new Schema ({
    akid: { type: Number, index: true },  // kalau ini unique user baru pasti fail
    name: String,
    apikey: { type: String, index: true } // kalau ini unique user baru pasti fail
  });

  user = new Schema ({
    uid: { type: Number, index: true },
    firstname: String,
    lastname: String,
    password: String,
    email: { type: String, unique: true, index: true },
    createdate: { type: Date },
    apikey: [userapi],
    gitlab: {
      token: String,
      syncPeriod: Number
    },
    role: { type: String, default: 'operator', index: true },
    status: String,
    inventories: [String],
    inventoryDir: Schema.Types.Mixed
  });

  return user;
}

var schema = newSchema(config.db.Schema);

schema.plugin(autoIncrement.plugin, {
  model: 'User',
  field: 'uid',
  startAt: 1,
  incrementBy: 1
});

schema.pre('save', function(next) {
  var now = new Date();
  var self = this;
  this.createdate = now;
  next();
});

var model = config.db.model('User', schema);

module.exports = model;
