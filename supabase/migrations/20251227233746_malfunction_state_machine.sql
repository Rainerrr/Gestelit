-- Implement malfunction state machine validation
-- Enforces valid transitions: open -> known -> solved
-- Prevents invalid transitions: solved -> anything, known -> open

CREATE OR REPLACE FUNCTION validate_malfunction_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Only validate if status is being changed
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Valid transitions:
  -- open -> known (acknowledged)
  -- open -> solved (directly resolved)
  -- known -> solved (resolved after acknowledgment)

  -- Invalid: solved -> anything (solved is terminal)
  IF OLD.status = 'solved' AND NEW.status != 'solved' THEN
    RAISE EXCEPTION 'Cannot transition malfunction from solved to another status';
  END IF;

  -- Invalid: known -> open (cannot un-acknowledge)
  IF OLD.status = 'known' AND NEW.status = 'open' THEN
    RAISE EXCEPTION 'Cannot transition malfunction from known back to open';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for malfunction status updates
DROP TRIGGER IF EXISTS malfunction_state_transition_check ON public.malfunctions;
CREATE TRIGGER malfunction_state_transition_check
BEFORE UPDATE OF status ON public.malfunctions
FOR EACH ROW EXECUTE FUNCTION validate_malfunction_transition();
