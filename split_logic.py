def calculate_balances(purchase):
    totals = {}

    paid_by = purchase["paid_by"]
    items = purchase["items"]

    # Ensure payer is in totals
    if paid_by not in totals:
        totals[paid_by] = 0

    for item in items:
        price = float(item["price"])  # extra safety
        owners = item["owners"]

        # Guard against division by zero
        if not owners:
            continue

        split_price = price / len(owners)

        for person in owners:
            if person not in totals:
                totals[person] = 0
            totals[person] += split_price

        totals[paid_by] -= price

    return totals
