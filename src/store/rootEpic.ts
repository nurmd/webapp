import _ from 'lodash'
import { combineEpics } from 'redux-observable'

import * as albumEpics from './albums/epics'
import * as authEpics from './auth/epics'
import * as imageEpics from './images/epics'
import * as notificationsEpics from './notifications/epics'
import * as sharingEpics from './sharing/epics'
import * as webSocketEpics from './webSocket/epics'

const rootEpic = combineEpics(
  ..._.values(albumEpics),
  ..._.values(authEpics),
  ..._.values(imageEpics),
  ..._.values(notificationsEpics),
  ..._.values(sharingEpics),
  ..._.values(webSocketEpics),
)

export default rootEpic
