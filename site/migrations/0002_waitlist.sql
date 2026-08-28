-- Beta waitlist. No user accounts: these rows are not owned by anyone, and the
-- only way in is the public form.
--
-- One email is one row. Fifty seats: thirty first-come (`seat-fcfs`, numbered
-- 1..30) and twenty allotted by hand (`reserved-allotted`, numbered 1..20).
-- `waitlist` is a person who asked for a seat after the thirty went.
-- `reminder-only` asked for an email and claimed nothing.
--
-- The seat rules are constraints, not conventions: a bug here should fail the
-- insert rather than quietly hand out a thirty-first seat.

create table if not exists waitlist (
  id               serial primary key,
  created_at       timestamptz not null default now(),
  name             text        not null,
  email            text        not null,
  email_normalized text        not null,
  firm             text,
  role             text,
  interest         text        not null,
  remind_beta      boolean     not null default false,
  remind_launch    boolean     not null default false,
  status           text        not null,
  fcfs_seat        integer,
  reserved_seat    integer,

  constraint waitlist_interest_ck
    check (interest in ('proof', 'review', 'both')),

  constraint waitlist_status_ck
    check (status in ('seat-fcfs', 'waitlist', 'reserved-allotted', 'reminder-only')),

  -- A first-come seat carries a number in 1..30, and nothing else may.
  constraint waitlist_fcfs_seat_ck
    check (
      (status = 'seat-fcfs' and fcfs_seat between 1 and 30)
      or (status <> 'seat-fcfs' and fcfs_seat is null)
    ),

  -- A reserved seat carries a number in 1..20, and nothing else may.
  constraint waitlist_reserved_seat_ck
    check (
      (status = 'reserved-allotted' and reserved_seat between 1 and 20)
      or (status <> 'reserved-allotted' and reserved_seat is null)
    )
);

-- One email, one row. This is what stops a second submit taking a second seat.
create unique index if not exists waitlist_email_uidx
  on waitlist (email_normalized);

-- Two people cannot hold the same seat, whatever the application believes.
create unique index if not exists waitlist_fcfs_seat_uidx
  on waitlist (fcfs_seat) where fcfs_seat is not null;

create unique index if not exists waitlist_reserved_seat_uidx
  on waitlist (reserved_seat) where reserved_seat is not null;

create index if not exists waitlist_status_idx on waitlist (status);
