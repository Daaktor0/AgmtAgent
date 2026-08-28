-- Correct the seat check constraints from 0002.
--
-- 0002 wrote them as:
--
--   (status = 'seat-fcfs' and fcfs_seat between 1 and 30)
--     or (status <> 'seat-fcfs' and fcfs_seat is null)
--
-- With status = 'seat-fcfs' and fcfs_seat null, the first branch is
-- `true and null` -> null and the second is `false and true` -> false, so the
-- whole expression is null. A CHECK only rejects on false, so a first-come row
-- carrying no seat number was accepted — precisely the case the constraint
-- existed to stop.
--
-- Written as a CASE with an explicit `is not null`, so every combination
-- evaluates to true or false and never to null.
--
-- This is a separate migration rather than an edit to 0002 because 0002 may
-- already have been applied; a database that recorded it would never see a fix
-- made in place.

alter table waitlist drop constraint if exists waitlist_fcfs_seat_ck;
alter table waitlist add constraint waitlist_fcfs_seat_ck check (
  case
    when status = 'seat-fcfs'
      then fcfs_seat is not null and fcfs_seat between 1 and 30
    else fcfs_seat is null
  end
);

alter table waitlist drop constraint if exists waitlist_reserved_seat_ck;
alter table waitlist add constraint waitlist_reserved_seat_ck check (
  case
    when status = 'reserved-allotted'
      then reserved_seat is not null and reserved_seat between 1 and 20
    else reserved_seat is null
  end
);
