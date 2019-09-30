import BaseRecord from 'db/index'
import BaseService from './baseService'
import { Queue } from './dispatcher'

class Records extends BaseService {
  save = <T extends BaseRecord>(record: T) =>
    this.dispatcher.performAsync<T>(Queue.RecordOperation, function(
      resolve,
      reject,
    ) {
      record
        .save()
        .then(() => {
          resolve(record)
        })
        .catch(reject)
    })
}

export default new Records()
