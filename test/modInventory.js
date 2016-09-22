function newSchema(Schema) {
  inventory = new Schema ({
    iid: { type: Number, index: true },
    type: String,
    filename: String,
    rev: Number,
    createdate: Date,
    status: [Schema.Types.Mixed]
  });

  return inventory;
}

var schema = newSchema(config.db.Schema);

schema.plugin(autoIncrement.plugin, {
  model: 'Inventory',
  field: 'iid',
  startAt: 1,
  incrementBy: 1
});

schema.pre('save', function(next) {
  var date = new Date();
  this.rev = date.getTime();
  if ( !this.createdate ) {
    this.createdate = date;
  }
  next();
});
schema.pre('update', function(next){
  var date = new Date();
  this.rev = date.getTime();
  next();
});

var model = config.db.model('Inventory', schema);

module.exports = model;
