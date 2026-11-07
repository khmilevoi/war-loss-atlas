-- Input: source(actor_id, year, is_government_actor, low, best, high).
-- The importer validates actor-year keys and maps missing estimates to NULL.
WITH RECURSIVE
years(year) AS (
    SELECT 1989
    UNION ALL
    SELECT year + 1 FROM years WHERE year < 2025
),
actor_types(actor_type, sort_order) AS (
    VALUES ('government', 1), ('non_government', 2), ('unknown_native_flag', 3)
),
classified AS (
    SELECT *,
        CASE is_government_actor
            WHEN '1' THEN 'government'
            WHEN '0' THEN 'non_government'
            ELSE 'unknown_native_flag'
        END AS actor_type
    FROM source
),
annual AS (
    SELECT
        years.year,
        actor_types.actor_type,
        actor_types.sort_order,
        COUNT(classified.actor_id) AS actor_year_rows,
        COUNT(DISTINCT classified.actor_id) AS unique_actor_ids,
        COUNT(CASE WHEN classified.actor_type = 'unknown_native_flag' THEN 1 END)
            AS unknown_native_actor_type_rows,
        COUNT(classified.actor_id) AS cultural_classification_not_attempted_rows,
        COALESCE(SUM(classified.low), 0) AS low_sum,
        COUNT(classified.actor_id) - COUNT(classified.low) AS missing_low_rows,
        COALESCE(SUM(classified.best), 0) AS best_sum,
        COUNT(classified.actor_id) - COUNT(classified.best) AS missing_best_rows,
        COALESCE(SUM(classified.high), 0) AS high_sum,
        COUNT(classified.actor_id) - COUNT(classified.high) AS missing_high_rows
    FROM years
    CROSS JOIN actor_types
    LEFT JOIN classified USING (year, actor_type)
    GROUP BY years.year, actor_types.actor_type, actor_types.sort_order
)
SELECT
    year,
    actor_type,
    actor_year_rows,
    unique_actor_ids,
    unknown_native_actor_type_rows,
    cultural_classification_not_attempted_rows,
    low_sum,
    missing_low_rows,
    best_sum,
    missing_best_rows,
    high_sum,
    missing_high_rows,
    CASE
        WHEN missing_low_rows + missing_best_rows + missing_high_rows > 0
            THEN 'partial_observed_sum_missing_values_not_imputed'
        ELSE 'complete_for_present_source_rows'
    END AS sum_status,
    'source low/best/high sums;not statistical confidence interval' AS estimate_semantics,
    'no source rows or zero observed source sum;not proof world absence' AS zero_semantics
FROM annual
ORDER BY year, sort_order;
