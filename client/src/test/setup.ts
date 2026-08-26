import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'

/**
 * Testing Library waits one second by default before giving up on a findBy.
 *
 * That bound has nothing to do with the behaviour being asserted, which is
 * "this eventually appears", and a second is not much when a dozen jsdom
 * workers are competing for the same cores. It showed up as one test failing
 * roughly one run in four, always a different one, always passing when run on
 * its own: the shape of a timeout, not of a bug.
 *
 * Five seconds, well under the 30s test timeout, so a query that is genuinely
 * never going to resolve still fails with the right message rather than
 * hanging until vitest kills it.
 */
configure({ asyncUtilTimeout: 5000 })
