import cx from 'classnames'
import React from 'react'

import ListItem from '@material-ui/core/ListItem'
import ListItemText from '@material-ui/core/ListItemText'
import ListItemAvatar from '@material-ui/core/ListItemAvatar'
import Typography from '@material-ui/core/Typography'
import { createStyles, makeStyles, Theme } from '@material-ui/core/styles'

import UserAvatar from 'components/UserAvatar'
import User from 'models/user'

export interface IProps {
  className?: string
  component?: React.ElementType
  user: User
  message?: string
}

const useStyles = makeStyles((_theme: Theme) =>
  createStyles({
    root: {},
    inline: {
      display: 'inline',
    },
    verticallyCenteredText: {
      alignItems: 'center',
      display: 'flex',
      height: '100%',
    },
  }),
)

function UserListItem({ className, component, message, user }: IProps) {
  const classes = useStyles()
  const hasSecondLine = user.name !== undefined || message !== undefined

  return (
    <ListItem
      component={component || 'li'}
      className={cx(classes.root, className)}
      alignItems="flex-start"
    >
      <ListItemAvatar>
        <UserAvatar user={user} />
      </ListItemAvatar>
      <ListItemText
        classes={{
          root: cx({
            [classes.verticallyCenteredText]: !hasSecondLine,
          }),
        }}
        primary={user.username}
        secondary={
          <>
            {user.name && (
              <>
                <Typography
                  component="span"
                  variant="body2"
                  className={classes.inline}
                  color="textPrimary"
                >
                  {user.name}
                </Typography>
                {message && ' — '}
              </>
            )}
            {message}
          </>
        }
      />
    </ListItem>
  )
}

export default UserListItem
