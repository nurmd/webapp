import React from 'react'
import { useTheme } from '@material-ui/core/styles'

interface IProps {
  dark?: boolean
}

function WBM({ dark }: IProps) {
  const theme = useTheme()
  const color = dark ? theme.palette.primary.main : theme.palette.common.white

  return (
    <svg
      data-name="wbm"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1595.86 377.4"
    >
      <defs>
        <style>
          {`
      .cls-1,
      .cls-5{fill:#e61f68;}
      .cls-2,
      .cls-6{fill:#fcdc00;}
      .cls-3,
      .cls-7{fill:#0ca438;}
      .cls-4{fill:#05b6de;}
      .cls-5{opacity:0.74;}
      .cls-6{opacity:0.62;}
      .cls-7{opacity:0.35;}
      .cls-8{fill:${color};}
          `}
        </style>
      </defs>
      <title>wbm</title>
      <path
        className="cls-1"
        d="M406,176.05c-5.05,10.85-13.42,20.33-23.85,28.12-41.14,30.74-115.6,37.22-147.35-1.12-46.5-56.13-30.93-143.93,3.08-172.63,33-27.85,112.92-9.4,155.89,60.49C413.61,123.18,417,152.43,406,176.05Z"
        transform="translate(-14.6 -17.99)"
      />
      <path
        className="cls-2"
        d="M398.93,278.3C380.18,320.41,353,361.74,314.1,381.65c-52.86,27-125.26-50-87-121.78C274.66,170.74,443.92,177.25,398.93,278.3Z"
        transform="translate(-14.6 -17.99)"
      />
      <path
        className="cls-3"
        d="M171.22,334.73c-.89,8.27-4.35,16.34-9.61,23.73-20.73,29.17-61.14,48.21-97.23,25.54C20,356.14,4.61,296,21,269.67c15.87-25.52,55-19,114.44,9.18C160.15,290.59,173.14,316.74,171.22,334.73Z"
        transform="translate(-14.6 -17.99)"
      />
      <path
        className="cls-4"
        d="M123.64,335.43c-60.28-25.34-86.79-128.19-49.85-195.5C100.21,91.78,156,62.49,212.66,82.48,404.84,150.33,198.34,366.83,123.64,335.43Z"
        transform="translate(-14.6 -17.99)"
      />
      <path
        className="cls-5"
        d="M406,176.05c-5.05,10.85-13.42,20.33-23.85,28.12-41.14,30.74-115.6,37.22-147.35-1.12-46.5-56.13-30.93-143.93,3.08-172.63,33-27.85,112.92-9.4,155.89,60.49C413.61,123.18,417,152.43,406,176.05Z"
        transform="translate(-14.6 -17.99)"
      />
      <path
        className="cls-6"
        d="M398.93,278.3C380.18,320.41,353,361.74,314.1,381.65c-52.86,27-125.26-50-87-121.78C274.66,170.74,443.92,177.25,398.93,278.3Z"
        transform="translate(-14.6 -17.99)"
      />
      <path
        className="cls-7"
        d="M171.22,334.73c-.89,8.27-4.35,16.34-9.61,23.73-20.73,29.17-61.14,48.21-97.23,25.54C20,356.14,4.61,296,21,269.67c15.87-25.52,55-19,114.44,9.18C160.15,290.59,173.14,316.74,171.22,334.73Z"
        transform="translate(-14.6 -17.99)"
      />
      <path
        className="cls-8"
        d="M1426.79,288.39l42-21.6a82.09,82.09,0,0,0,50.13,14.26c8.8-.11,17.5-.89,25.95-3.52a44.88,44.88,0,0,0,14.49-7.43,22.65,22.65,0,0,0,9.08-20.06,22.29,22.29,0,0,0-5.54-13.28A40.31,40.31,0,0,0,1548,226a136.58,136.58,0,0,0-25.48-8.18c-8.48-2-17-3.61-25.52-5.67-12.67-3.08-24.91-7.36-36.25-13.94-8.36-4.85-15.76-10.81-21.41-18.75a50.49,50.49,0,0,1-9.25-25.17,58.29,58.29,0,0,1,3.94-28.2c3.73-8.89,9.92-15.85,17.37-21.76,9.52-7.56,20.36-12.43,32-15.54a131.46,131.46,0,0,1,39.5-4.16,127.09,127.09,0,0,1,38.48,7.16c21.22,7.82,36.13,23,36.39,23.35a.83.83,0,0,1,.14.21c-.14-.21-41,17.25-41,17.25a89.52,89.52,0,0,0-12-5.94,88.07,88.07,0,0,0-18-3.8,99.16,99.16,0,0,0-17.23-.43c-9.23.59-18.13,2.5-26.42,6.72-4.64,2.36-8.43,5.59-10.51,10.53-3,7-1.76,19.72,6.93,26a65.69,65.69,0,0,0,15.73,7.89,167.86,167.86,0,0,0,26.08,6.92c14.45,2.85,28.72,6.35,42.5,11.62,8.62,3.3,16.92,7.22,24.27,12.89,11.08,8.55,18.49,19.52,21,33.4a62.86,62.86,0,0,1-7.8,44.21c-7,12-17.35,20.16-29.58,26.2a97.91,97.91,0,0,1-27.24,8.49,158.37,158.37,0,0,1-36,1.67A154.44,154.44,0,0,1,1447,302.55C1440,299,1427,288.58,1426.79,288.39Z"
        transform="translate(-14.6 -17.99)"
      />
      <g>
        <g>
          <path
            className="cls-8"
            d="M728,119.9c-22.53-22.53-49.65-33.8-81.78-33.8S587,97.37,564.47,119.9,530.68,170,530.68,201.68l-.21,175,39.95,18.73.31-106.09c21.28,18.77,46.73,28.37,75.52,28.37,32.13,0,59.25-11.27,81.78-33.8,22.53-22.95,34.21-50.07,34.21-82.19C762.24,170,750.56,142.43,728,119.9ZM646.25,277.61c-20.86,0-38.8-7.51-53.41-22.11-15-15-22.11-33-22.11-53.82a76,76,0,0,1,10-38,72.83,72.83,0,0,1,27.54-27.54,74.92,74.92,0,0,1,38-10c20.86,0,38.8,7.51,53.4,22.11,15,15,22.54,32.55,22.54,53.41s-7.51,38.8-22.54,53.82C685.05,270.1,667.11,277.61,646.25,277.61Z"
            transform="translate(-14.6 -17.99)"
          />
          <path
            className="cls-8"
            d="M821.74,104.11l-.34,210.68H864L863.9,89.07Z"
            transform="translate(-14.6 -17.99)"
          />
          <path
            className="cls-8"
            d="M1143,314.79l-92.69-110.61L1136,92.47h-48.69l-62.85,83.76L954.32,92.47H904.49L997,201.68l-90.5,113.11h48.23l67.72-85.16,71.32,85.16Z"
            transform="translate(-14.6 -17.99)"
          />
          <path
            className="cls-8"
            d="M1343.16,92.47l-.06,118.8c0,17.94-6.68,33.38-19.19,45.9-12.94,12.93-28,19.19-45.9,19.19s-33-6.26-45.89-19.19c-12.52-12.52-18.78-28-18.78-45.9l.05-118.8h-41.84l.07,118.8c0,29.63,10,54.66,30.87,75.52s45.9,31.3,75.52,31.3c29.21,0,54.66-10.44,75.52-31.3s31.29-45.89,31.29-75.52l0-118.8Z"
            transform="translate(-14.6 -17.99)"
          />
          <path d="M1454.77,148.69" transform="translate(-14.6 -17.99)" />
        </g>
      </g>
    </svg>
  )
}

export default WBM
