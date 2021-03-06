import React from 'react'
import cx from 'classnames'
import CheckCircleIcon from '@material-ui/icons/CheckCircle'
import ErrorIcon from '@material-ui/icons/Error'
import InfoIcon from '@material-ui/icons/Info'
import CloseIcon from '@material-ui/icons/Close'
import { amber } from '@material-ui/core/colors'
import IconButton from '@material-ui/core/IconButton'
import SnackbarContent from '@material-ui/core/SnackbarContent'
import WarningIcon from '@material-ui/icons/Warning'
import { makeStyles, Theme } from '@material-ui/core/styles'

const ToastIcon = {
  success: CheckCircleIcon,
  warning: WarningIcon,
  error: ErrorIcon,
  info: InfoIcon,
}

export type ToastVariant = keyof typeof ToastIcon

const useStyles = makeStyles((theme: Theme) => ({
  root: {
    [theme.breakpoints.down('xs')]: {
      maxWidth: 288,
    },
    flexFlow: 'row',
    maxWidth: 320,
  },
  success: {
    backgroundColor: theme.palette.secondary.main,
  },
  error: {
    backgroundColor: theme.palette.error.dark,
  },
  info: {
    backgroundColor: theme.palette.secondary.light,
  },
  warning: {
    backgroundColor: amber[700],
  },
  icon: {
    fontSize: 20,
  },
  iconVariant: {
    opacity: 0.9,
    marginRight: theme.spacing(1),
  },
  message: {
    display: 'flex',
    alignItems: 'center',
  },
}))

export interface Props {
  children?: React.ReactNode
  className?: string
  message?: string
  onClose?: () => void
  variant: ToastVariant
}

function Toast({
  children,
  className,
  message,
  onClose,
  variant,
  ...other
}: Props) {
  const classes = useStyles()
  const Icon = ToastIcon[variant]

  return (
    <SnackbarContent
      className={cx(classes.root, classes[variant], className)}
      aria-describedby="toast-notification"
      message={
        <span id="toast-notification" className={classes.message}>
          <Icon className={cx(classes.icon, classes.iconVariant)} />
          {children || message}
        </span>
      }
      action={[
        <IconButton
          key="close"
          aria-label="close"
          color="inherit"
          onClick={onClose}
        >
          <CloseIcon className={classes.icon} />
        </IconButton>,
      ]}
      {...other}
    />
  )
}

export default Toast
