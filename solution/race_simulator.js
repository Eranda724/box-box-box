const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
//  DEFAULT CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CONSTANTS = {
    // Speed delta vs MEDIUM baseline (seconds per lap)
    compound_offset: {
        "SOFT":   -1.5,
        "MEDIUM":  0.0,
        "HARD":    1.5
    },

    // Per-lap degradation rate (seconds added per lap of tire age, per lap)
    deg_rate: {
        "SOFT":   0.10,
        "MEDIUM": 0.05,
        "HARD":   0.02
    },

    // Number of initial laps on which degradation is zero (honeymoon period)
    cliff: {
        "SOFT":   1,
        "MEDIUM": 3,
        "HARD":   5
    },

    // Temperature scaling of degradation
    temp_coeff: 0.02,
    temp_ref:   20.0
};


// ─────────────────────────────────────────────────────────────────────────────
//  Core simulation
// ─────────────────────────────────────────────────────────────────────────────

function simulateRace(raceConfig, strategies, constants) {
    const { compound_offset, deg_rate, cliff, temp_coeff, temp_ref } = constants;

    const base        = raceConfig.base_lap_time;
    const pit_penalty = raceConfig.pit_lane_time;
    const temp        = raceConfig.track_temp;
    const total_laps  = raceConfig.total_laps;

    const temp_factor = 1.0 + temp_coeff * (temp - temp_ref);
    const driverTimes = [];

    for (const posKey in strategies) {
        const strategy = strategies[posKey];
        const driver_id = strategy.driver_id;
        let tire = strategy.starting_tire;
        let tire_age = 0;
        let total_time = 0.0;

        // Build a lookup: {lap_number -> new_tire_compound}
        const pit_schedule = {};
        for (const p of strategy.pit_stops) {
            pit_schedule[p.lap] = p.to_tire;
        }

        for (let lap = 1; lap <= total_laps; lap++) {
            tire_age += 1;

            const effective_age = Math.max(0, tire_age - cliff[tire]);
            let lap_time = base + compound_offset[tire] + deg_rate[tire] * effective_age * temp_factor;

            if (pit_schedule[lap]) {
                lap_time += pit_penalty;
                tire = pit_schedule[lap];
                tire_age = 0;
            }

            total_time += lap_time;
        }

        driverTimes.push({ id: driver_id, time: total_time });
    }

    // Sort drivers by total time ascending (fastest = 1st place)
    // If times are equal, sort alphabetically by driver ID
    driverTimes.sort((a, b) => {
        let diff = a.time - b.time;
        if (Math.abs(diff) < 1e-7) {
            return a.id.localeCompare(b.id);
        }
        return diff;
    });
    return driverTimes.map(d => d.id);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Entry point
// ─────────────────────────────────────────────────────────────────────────────

function main() {
    let constants = DEFAULT_CONSTANTS;
    try {
        const constantsPath = path.join(__dirname, 'constants.json');
        if (fs.existsSync(constantsPath)) {
            constants = JSON.parse(fs.readFileSync(constantsPath, 'utf8'));
        }
    } catch (e) {
        // use defaults
    }

    // Read from stdin to string
    let inputData = '';
    process.stdin.setEncoding('utf8');
    
    process.stdin.on('data', chunk => {
        inputData += chunk;
    });

    process.stdin.on('end', () => {
        if (!inputData.trim()) return;

        const testCase = JSON.parse(inputData);
        const race_id = testCase.race_id;
        const race_config = testCase.race_config;
        const strategies = testCase.strategies;

        const finishing_positions = simulateRace(race_config, strategies, constants);

        const output = {
            race_id: race_id,
            finishing_positions: finishing_positions
        };

        // Write directly to stdout
        console.log(JSON.stringify(output));
    });
}

main();
