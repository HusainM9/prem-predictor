export type ShareablePredictionRow = {
  id: string;
  fixture_id: string;
  pred_home_goals: number;
  pred_away_goals: number;
  pick: "H" | "D" | "A";
  submitted_at: string;
  points_awarded: number;
  bonus_points: number;
  total_points: number;
  settled_at: string | null;
  fixture: {
    home_team: string;
    away_team: string;
    kickoff_time: string;
    gameweek: number;
    status: string | null;
    home_goals: number | null;
    away_goals: number | null;
  };
};

export function buildPredictionSharePayload(prediction: ShareablePredictionRow) {
  return {
    prediction_id: prediction.id,
    fixture_id: prediction.fixture_id,
    pred_home_goals: prediction.pred_home_goals,
    pred_away_goals: prediction.pred_away_goals,
    pick: prediction.pick,
    submitted_at: prediction.submitted_at,
    points_awarded: prediction.points_awarded,
    bonus_points: prediction.bonus_points,
    total_points: prediction.total_points,
    settled_at: prediction.settled_at,
    fixture: prediction.fixture,
  };
}

