# split_logic.py

def calculate_balances(purchases):
    totals = {}

    # Find all people involved and initialize to 0
    for purchase in purchases:
        payer = purchase["paid_by"]
        if payer not in totals:
            totals[payer] = 0

        for item in purchase["items"]:
            for person in item["owners"]:
                if person not in totals:
                    totals[person] = 0

    # Process each purchase
    for purchase in purchases:
        paid_by = purchase["paid_by"]
        total_paid = 0

        for item in purchase["items"]:
            price = item["price"]
            owners = item["owners"]
            split_price = price / len(owners)

            for person in owners:
                totals[person] += split_price

            total_paid += price

        totals[paid_by] -= total_paid

    return totals


